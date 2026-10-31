"""Read-only, public GitHub REST adapter. Every URL is constructed on api.github.com."""
import httpx

class GitHubError(Exception):
    def __init__(self, status, code): self.status, self.code = status, code

class ScanLimit(Exception): pass

class GitHubClient:
    def __init__(self, token='', transport=None, max_pages=20):
        headers = {'Accept':'application/vnd.github+json','User-Agent':'DevRecall',
                   'X-GitHub-Api-Version':'2022-11-28'}
        if token: headers['Authorization'] = f'Bearer {token}'
        self.client = httpx.Client(base_url='https://api.github.com', headers=headers,
                                   timeout=20, transport=transport, follow_redirects=False)
        self.max_pages = max_pages

    def close(self): self.client.close()

    def get(self, path, params=None):
        try: response = self.client.get(path, params=params)
        except httpx.HTTPError: raise GitHubError(502, 'github_unavailable') from None
        if response.status_code in (403,429): raise GitHubError(429, 'github_rate_limited_or_forbidden')
        if response.status_code == 404: raise GitHubError(404, 'public_repository_not_found')
        # GitHub renames use API redirects. Only follow same-host API paths, never arbitrary URLs.
        if response.status_code in (301,302,307,308):
            target = httpx.URL(response.headers.get('location', ''))
            if target.scheme != 'https' or target.host != 'api.github.com':
                raise GitHubError(502, 'unsafe_github_redirect')
            try: response = self.client.get(str(target))
            except httpx.HTTPError: raise GitHubError(502, 'github_unavailable') from None
        if not response.is_success: raise GitHubError(502, 'github_request_failed')
        return response.json()

    def resolve(self, alias):
        value = self.get(f'/repos/{alias}')
        if value.get('private') or value.get('visibility', 'public') != 'public':
            raise GitHubError(404, 'public_repository_not_found')
        return {'repo_id':value['id'], 'github_node_id':value.get('node_id'),
                'owner_login':value['owner']['login'], 'name':value['name'],
                'full_name':value['full_name'], 'html_url':value['html_url'],
                'default_branch':value.get('default_branch'), 'visibility':'public'}

    def pages(self, path, params=None):
        for page in range(1, self.max_pages + 1):
            values = self.get(path, {**(params or {}), 'per_page':100, 'page':page})
            yield from values
            if len(values) < 100: return
        raise ScanLimit('Source pagination limit reached; no incomplete source was analyzed')

    def issue_page(self, alias, page):
        return self.get(f'/repos/{alias}/issues', {'state':'all','sort':'created','direction':'asc',
                                                  'per_page':100,'page':page})

    def thread(self, repo, issue):
        alias, repo_id = repo['full_name'], repo['repo_id']
        number = issue['number']
        kind = 'pr' if 'pull_request' in issue else 'issue'
        source_key = f'github:{kind}:{number}'
        thread_id = f'{repo_id}:{source_key}'
        def message(value, category, sequence):
            return {'external_id':str(value['id']), 'original_id':f'{thread_id}:{category}:{value["id"]}',
                    'thread_id':thread_id, 'sequence_number':sequence, 'body':value.get('body') or '',
                    'author':(value.get('user') or {}).get('login'), 'source_url':value.get('html_url'),
                    'created_at':value.get('created_at'), 'updated_at':value.get('updated_at'),
                    'kind':category, 'path':value.get('path')}
        messages = [message(issue,'description',0)]
        paths = [(f'/repos/{alias}/issues/{number}/comments','comment')]
        if kind == 'pr':
            paths += [(f'/repos/{alias}/pulls/{number}/reviews','review'),
                      (f'/repos/{alias}/pulls/{number}/comments','review_comment')]
        for path, category in paths:
            for value in self.pages(path): messages.append(message(value,category,len(messages)))
        return {'_id':thread_id,'repo_id':repo_id,'source_key':source_key,'kind':kind,
                'external_id':str(issue['id']),'number':number,'title':issue['title'],
                'source_url':issue['html_url'],'github_updated_at':issue['updated_at']}, messages
