"""Voice the tutorial narration offline with Piper (open-source TTS).

Usage: python3 tools/narrate.py <voice.onnx> [speaker_id]
Voice used: en_US-libritts_r-medium (LibriTTS-R dataset, CC BY 4.0), from rhasspy/piper-voices.
Writes web/tutorial/narration.json: {line_id: {"dur": seconds, "src": "data:audio/mpeg;base64,..."}}
"""
import base64, json, os, subprocess, sys, tempfile, wave
from piper import PiperVoice, SynthesisConfig

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
voice = PiperVoice.load(sys.argv[1])
speaker = int(sys.argv[2]) if len(sys.argv) > 2 else 600
lines = json.loads(subprocess.check_output(['npx', 'tsx', 'tools/lines.ts'], cwd=root))
cfg = SynthesisConfig(speaker_id=speaker, length_scale=1.06)
out = {}
with tempfile.TemporaryDirectory() as tmp:
    for key, text in lines.items():
        wav = os.path.join(tmp, key + '.wav')
        mp3 = os.path.join(tmp, key + '.mp3')
        with wave.open(wav, 'wb') as w:
            voice.synthesize_wav(text, w, syn_config=cfg)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-ac', '1', '-ar', '22050', '-b:a', '40k', mp3], check=True)
        with wave.open(wav) as w:
            dur = w.getnframes() / w.getframerate()
        out[key] = {'dur': round(dur, 3), 'src': 'data:audio/mpeg;base64,' + base64.b64encode(open(mp3, 'rb').read()).decode()}
        print(f'{key}: {dur:.1f}s', flush=True)
json.dump(out, open(os.path.join(root, 'web/tutorial/narration.json'), 'w'))
print('total', round(sum(v['dur'] for v in out.values())), 'seconds')
