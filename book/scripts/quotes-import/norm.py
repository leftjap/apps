import re, unicodedata
_LINK   = re.compile(r'\[([^\[\]]*)\]\([^)]*\)')      # [text](url) → text
_REFLNK = re.compile(r'\[([^\[\]]*)\]\[[^\]]*\]')     # [text][1]   → text
_ATTR   = re.compile(r'\{\.[a-zA-Z-]+\}')             # {.mark}{.underline}
_URL    = re.compile(r'https?://\S+')
def norm(s):
    s = unicodedata.normalize('NFKC', s)
    s = _ATTR.sub('', s)
    s = re.sub(r'\\(.)', r'\1', s)          # \' \" \- escape 해제
    for _ in range(3):                       # 중첩 링크 대응
        s = _LINK.sub(r'\1', s)
        s = _REFLNK.sub(r'\1', s)
    s = _URL.sub('', s)
    s = s.replace('**','').replace('*','').replace('#','').replace('>','')
    s = s.replace('[','').replace(']','')
    s = re.sub(r'(?m)^[\s]*[-•·]+[\s]*', '', s)   # 줄머리 불릿
    s = s.replace('•','')
    for a,b in [('‘',"'"),('’',"'"),('“','"'),('”','"'),
                ('–','-'),('—','-'),('―','-'),('─','-'),
                ('＂','"'),('＇',"'")]:
        s = s.replace(a,b)
    s = re.sub(r'\s+','', s)
    return s
