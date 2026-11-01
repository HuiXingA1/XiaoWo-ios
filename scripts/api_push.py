"""Push repo files to GitHub via Contents API (network flaky: retries hard).
Runs from D:/DeepseekWork/xiaowo-ios."""
import base64, json, urllib.request, os, time, subprocess, sys

TOKEN = "<YOUR_OLD_TOKEN>"
OWNER = "YOUR_GITHUB_USER"
REPO  = "xiaowo-ios"
API   = f"https://api.github.com/repos/{OWNER}/{REPO}"
HDR = {"Authorization": f"token {TOKEN}", "Accept": "application/vnd.github+json",
       "User-Agent": "xiaowo-push", "Connection": "close"}

def call(url, data=None, tries=6):
    method = "PUT" if data else "GET"
    body = json.dumps(data).encode() if data else None
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=HDR, data=body, method=method)
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code in (409, 422, 404) and i < tries - 1:
                time.sleep(2); last = e; continue
            raise
        except Exception as e:
            last = e; time.sleep(2)
    raise last

def upload(path, message):
    content = open(path.replace("/", os.sep), "rb").read()
    b64 = base64.b64encode(content).decode()
    sha = None
    try:
        cur = call(f"{API}/contents/{path}?ref=main")
        sha = cur.get("sha")
    except Exception:
        pass
    body = {"message": message, "content": b64, "branch": "main"}
    if sha:
        body["sha"] = sha
    r = call(f"{API}/contents/{path}", body)
    return r["commit"]["sha"]

files = subprocess.run(["git", "ls-files"], capture_output=True, text=True).stdout.split()
print("total files:", len(files))
done = 0
head_sha = None
for f in files:
    for attempt in range(4):
        try:
            head_sha = upload(f, f"add {f}")
            done += 1
            print(f"OK {f}")
            break
        except Exception as e:
            print(f"retry{attempt} {f}: {str(e)[:90]}")
            time.sleep(3)
    else:
        print(f"GIVEUP {f}")
print(f"uploaded {done}/{len(files)}; final head {head_sha}")
