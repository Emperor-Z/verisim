# Running VeriSim's LLM on Kaggle GPU (or Colab)

Goal: run Ollama on a free cloud GPU and expose it over a tunnel so VeriSim (running on your
laptop) uses the GPU for inference. Only the model inference moves; VeriSim stays local.

Why: fixes the CPU timeout (Finding 2) and lets us run a proper instruct model (Finding 3).

---

## Kaggle (recommended — 16 GB T4, ~30h/week)

1. kaggle.com → **Create → New Notebook**.
2. Settings (right panel): **Accelerator → GPU T4 x2**, and **Internet → On**
   (Internet requires a phone-verified Kaggle account — do this once in Settings).
3. Paste each block below into a cell and run in order.

### Cell 1 — install & start Ollama
```python
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

Then **send me the `https://xxxxx.trycloudflare.com` URL.** I point VeriSim at it:
```
npx convex env set OLLAMA_HOST https://xxxxx.trycloudflare.com
npx convex env set OLLAMA_MODEL llama3.1:8b-instruct-q4_K_M
```

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
