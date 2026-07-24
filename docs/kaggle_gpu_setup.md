# Running VeriSim's LLM on Kaggle GPU (or Colab)

Goal: run Ollama on a free cloud GPU and expose it over a tunnel so VeriSim (running on your
laptop) uses the GPU for inference. Only the model inference moves; VeriSim stays local.

Why: fixes the CPU timeout (Finding 2) and lets us run a proper instruct model (Finding 3).

---

## Kaggle (recommended — 16 GB T4/P100, ~30h/week)

**Done once (24 July 2026):** account phone-verified (required before GPU/Internet unlock in
Settings). CLI installed via `pipx install kaggle`; API token generated at
kaggle.com/settings/api and stored at `~/.kaggle/access_token` (not committed anywhere — see
"Auth" below). Pushing a notebook via the CLI (`kaggle kernels push`) as a batch kernel is much
faster to iterate on than clicking through the web editor cell-by-cell, and the live log stream
is readable from the kernel's page (`kaggle.com/code/<user>/<kernel>` → Logs tab) while it runs —
useful for grabbing the `trycloudflare.com` URL without waiting for the run to finish (the
`kaggle kernels output` CLI command only returns logs *after* a run completes, which doesn't work
for a kernel whose last cell is a long keep-alive loop).

**Auth:** `~/.kaggle/access_token` holds the live API token — kept out of both dissertation repos
deliberately (a committed live credential is bad practice even in a private repo). Regenerate at
kaggle.com/settings/api if it's ever lost/revoked.

**Known fix required:** Kaggle's notebook base image is missing `zstd`, which the Ollama install
script needs for extraction — install it before the Ollama installer (Cell 1 below already
includes this).

1. kaggle.com → **Create → New Notebook**.
2. Settings (right panel): **Accelerator → GPU T4 x2**, and **Internet → On**
   (Internet requires a phone-verified Kaggle account — do this once in Settings).
3. Paste each block below into a cell and run in order (or push all four as one notebook via the
   CLI — see `kaggle kernels push -p <dir>` with a `kernel-metadata.json` setting `enable_gpu` and
   `enable_internet` to `"true"`).

### Cell 1 — install zstd, install & start Ollama
```python
!apt-get update -qq && apt-get install -y -qq zstd
!curl -fsSL https://ollama.com/install.sh | sh
import os, subprocess, time
os.environ['OLLAMA_HOST'] = '0.0.0.0:11434'   # accept connections from the tunnel
subprocess.Popen(['ollama', 'serve'])
time.sleep(5)
print('ollama up')
```

### Cell 2 — pull a model (T4 16GB handles these at q4)
```python
!OLLAMA_HOST=0.0.0.0:11434 ollama pull llama3.1:8b-instruct-q4_K_M
# stronger option if the 8B still echoes the format:
# !OLLAMA_HOST=0.0.0.0:11434 ollama pull qwen2.5:14b-instruct-q4_K_M
```

### Cell 3 — open a public tunnel to the GPU
```python
!wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O cloudflared
!chmod +x cloudflared
import subprocess, re, time, threading
proc = subprocess.Popen(['./cloudflared','tunnel','--url','http://localhost:11434'],
                        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
def watch():
    for line in proc.stdout:
        print(line, end='')
threading.Thread(target=watch, daemon=True).start()
time.sleep(8)
print('\n>>> Look above for a https://<random>.trycloudflare.com URL — send me that.')
```

### Cell 4 — keep the notebook awake (leave running)
```python
import time
while True:
    time.sleep(60)
```

Then point VeriSim at it (needs the local Convex backend running — `docker compose up -d backend`):
```
npx convex env set OLLAMA_HOST https://xxxxx.trycloudflare.com
npx convex env set OLLAMA_MODEL llama3.1:8b-instruct-q4_K_M
```

**Live run (24 July 2026):** tunnel URL `https://lopez-void-populations-lights.trycloudflare.com`
(this specific URL is dead once that session ends — logged for the record only). Both env vars
set successfully; a direct chat-completions call in the new chat-native message shape produced
clean in-character dialogue with no artifacts — see `build_notes.md` "GPU validation" section for
the transcript.

---

## Colab (fallback — free T4, stricter idle limits)
Same idea. In a Colab notebook set **Runtime → Change runtime type → T4 GPU**, then run the same
four cells (drop the `!` is not needed — Colab supports `!` too). Colab disconnects on idle more
aggressively, so Cell 4 matters more.

---

## Caveats (note for reflection log)
- **Ephemeral:** the tunnel URL changes every time the notebook restarts; Kaggle sessions cap
  ~12h and time out on idle. Fine for a demo/recording session, not for always-on.
- **Latency:** each generation round-trips laptop → Cloudflare → GPU. Still far faster than local
  CPU, but not instant.
- **Open endpoint:** a `trycloudflare.com` URL is public while it's up. Low risk (just an LLM,
  no data), but don't leave it running unattended and don't send sensitive input.
- **Reproducibility:** record which model + platform produced any result you keep for the
  dissertation (the `OLLAMA_MODEL` value + "Kaggle T4").
