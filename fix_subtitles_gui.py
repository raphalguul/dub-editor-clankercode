import customtkinter as ctk
import os
import re
import subprocess
import sys
import json
import shutil
import threading
import webbrowser
from datetime import datetime, timedelta
from pathlib import Path
from tkinter import filedialog, messagebox

CONFIG_DIR = Path.home() / ".subtitle-gap-fixer"
CONFIG_FILE = CONFIG_DIR / "config.json"

DEFAULTS = {
    "subtitles_dir": r"E:\Projects\WTD\whatthedub\Subtitles",
    "videoclips_dir": r"E:\Projects\WTD\whatthedub\VideoClips",
    "output_dir": r"E:\Projects\WTD\whatthedub\Subtitles\Fixed",
    "max_age_days": 30,
    "gap_threshold_ms": 100,
    "extend_beyond_ms": 10,
    "ffprobe_path": "",
}


def load_config() -> dict:
    cfg = dict(DEFAULTS)
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r") as f:
                saved = json.load(f)
            cfg.update(saved)
        except Exception:
            pass
    return cfg


def save_config(cfg: dict):
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        json.dump(cfg, f, indent=2)


def find_ffprobe() -> str | None:
    exe = "ffprobe.exe" if sys.platform == "win32" else "ffprobe"

    found = shutil.which("ffprobe")
    if found:
        return found

    bundled = (
        Path(__file__).parent
        / "node_modules"
        / "ffprobe-static"
        / "bin"
        / "win32"
        / "x64"
        / "ffprobe.exe"
    )
    if bundled.exists():
        return str(bundled)

    return None


def timestamp_to_ms(ts: str) -> int:
    match = re.match(r"(\d{2}):(\d{2}):(\d{2}),(\d{3})", ts)
    if not match:
        raise ValueError(f"Invalid timestamp: {ts}")
    h, m, s, ms = match.groups()
    return int(h) * 3600000 + int(m) * 60000 + int(s) * 1000 + int(ms)


def ms_to_timestamp(ms: int) -> str:
    h = ms // 3600000
    ms %= 3600000
    m = ms // 60000
    ms %= 60000
    s = ms // 1000
    ms %= 1000
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def get_video_duration_ms(ffprobe_path: str, video_path: Path) -> int | None:
    try:
        kwargs = {"capture_output": True, "text": True, "timeout": 30}
        if sys.platform == "win32":
            kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
        result = subprocess.run(
            [
                ffprobe_path,
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(video_path),
            ],
            **kwargs,
        )
        duration_sec = float(result.stdout.strip())
        return round(duration_sec * 1000)
    except Exception as e:
        return None


def parse_last_timestamp(srt_path: Path) -> tuple[int, int] | None:
    content = srt_path.read_text(encoding="utf-8-sig")
    lines = content.replace("\r\n", "\n").split("\n")
    last_end_ms = None
    last_start_ms = None
    for line in lines:
        line = line.strip()
        m = re.match(r"(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})", line)
        if m:
            last_start_ms = timestamp_to_ms(m.group(1))
            last_end_ms = timestamp_to_ms(m.group(2))
    if last_end_ms is None:
        return None
    return (last_start_ms, last_end_ms)


def build_new_srt(srt_path: Path, new_end_ms: int) -> str:
    content = srt_path.read_text(encoding="utf-8-sig")
    lines = content.replace("\r\n", "\n").split("\n")
    last_timestamp_line_idx = None
    old_end_str = None
    for i, line in enumerate(lines):
        m = re.match(r"(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})", line.strip())
        if m:
            old_end_str = m.group(2)
            last_timestamp_line_idx = i
    if old_end_str is None or last_timestamp_line_idx is None:
        return content
    new_end_str = ms_to_timestamp(new_end_ms)
    old_line = lines[last_timestamp_line_idx]
    lines[last_timestamp_line_idx] = old_line.replace(old_end_str, new_end_str)
    return "\n".join(lines)


def is_recently_modified(file_path: Path, max_age_days: int) -> bool:
    mtime = datetime.fromtimestamp(file_path.stat().st_mtime)
    return mtime >= datetime.now() - timedelta(days=max_age_days)


class App(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("Subtitle Gap Fixer")
        self.geometry("720x640")
        self.minsize(600, 540)
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        self.cfg = load_config()
        self.running = False

        self._build_ui()
        self._probe_ffprobe()

    def _build_ui(self):
        pad = {"padx": 12, "pady": 4}

        title = ctk.CTkLabel(self, text="Subtitle Gap Fixer", font=ctk.CTkFont(size=20, weight="bold"))
        title.pack(pady=(14, 6))

        frame = ctk.CTkFrame(self, fg_color="transparent")
        frame.pack(fill="x", padx=12)

        self.sub_var = ctk.StringVar(value=self.cfg["subtitles_dir"])
        self.vid_var = ctk.StringVar(value=self.cfg["videoclips_dir"])
        self.out_var = ctk.StringVar(value=self.cfg["output_dir"])

        self._add_folder_row(frame, "Subtitles Folder:", self.sub_var, 0)
        self._add_folder_row(frame, "Video Clips Folder:", self.vid_var, 1)
        self._add_folder_row(frame, "Output Folder:", self.out_var, 2)

        opts = ctk.CTkFrame(self, fg_color="transparent")
        opts.pack(fill="x", padx=12, pady=(8, 0))

        self.age_var = ctk.StringVar(value=str(self.cfg["max_age_days"]))
        self.gap_var = ctk.StringVar(value=str(self.cfg["gap_threshold_ms"]))
        self.extend_var = ctk.StringVar(value=str(self.cfg["extend_beyond_ms"]))

        self._add_entry_row(opts, "Max Age (days):", self.age_var, 0)
        self._add_entry_row(opts, "Gap Threshold (ms):", self.gap_var, 1)
        self._add_entry_row(opts, "Extend Beyond (ms):", self.extend_var, 2)

        btn_frame = ctk.CTkFrame(self, fg_color="transparent")
        btn_frame.pack(fill="x", padx=12, pady=(10, 4))

        self.run_btn = ctk.CTkButton(btn_frame, text="  Run  ", font=ctk.CTkFont(size=14, weight="bold"),
                                     height=36, command=self._on_run)
        self.run_btn.pack(side="left")

        self.ffprobe_label = ctk.CTkLabel(btn_frame, text="", text_color="gray", font=ctk.CTkFont(size=11))
        self.ffprobe_label.pack(side="left", padx=(12, 0))

        self.progress = ctk.CTkProgressBar(self, height=12)
        self.progress.pack(fill="x", padx=12, pady=(6, 2))
        self.progress.set(0)

        self.progress_label = ctk.CTkLabel(self, text="", font=ctk.CTkFont(size=11), text_color="gray")
        self.progress_label.pack(anchor="w", padx=14)

        self.log_box = ctk.CTkTextbox(self, state="disabled", font=ctk.CTkFont(family="Consolas", size=11),
                                       wrap="word", height=200)
        self.log_box.pack(fill="both", expand=True, padx=12, pady=(4, 12))

    def _add_folder_row(self, parent, label_text, var, row):
        lbl = ctk.CTkLabel(parent, text=label_text, width=160, anchor="w")
        lbl.grid(row=row, column=0, padx=(0, 6), pady=4, sticky="w")
        entry = ctk.CTkEntry(parent, textvariable=var, width=400)
        entry.grid(row=row, column=1, padx=(0, 6), pady=4, sticky="ew")
        btn = ctk.CTkButton(parent, text="Browse", width=70,
                            command=lambda v=var: self._browse_folder(v))
        btn.grid(row=row, column=2, pady=4)
        parent.columnconfigure(1, weight=1)

    def _add_entry_row(self, parent, label_text, var, row):
        lbl = ctk.CTkLabel(parent, text=label_text, width=160, anchor="w")
        lbl.grid(row=row, column=0, padx=(0, 6), pady=4, sticky="w")
        entry = ctk.CTkEntry(parent, textvariable=var, width=100)
        entry.grid(row=row, column=1, padx=(0, 6), pady=4, sticky="w")

    def _browse_folder(self, var):
        path = filedialog.askdirectory()
        if path:
            var.set(path)

    def _probe_ffprobe(self):
        saved = self.cfg.get("ffprobe_path", "")
        if saved and Path(saved).exists():
            self.ffprobe_path = saved
            self.ffprobe_label.configure(text=f"ffprobe: {Path(saved).name}", text_color="green")
            return

        found = find_ffprobe()
        if found:
            self.ffprobe_path = found
            self.ffprobe_label.configure(text=f"ffprobe: {Path(found).name}", text_color="green")
            return

        self.ffprobe_path = ""
        self.ffprobe_label.configure(text="ffprobe not found - browse to locate", text_color="#e74c3c")
        self._prompt_ffprobe()

    def _prompt_ffprobe(self):
        result = messagebox.askyesno(
            "ffprobe Not Found",
            "ffprobe was not found on your system.\n\n"
            "Do you want to browse for ffprobe.exe?\n"
            "(Click No to open the download page instead)"
        )
        if result:
            path = filedialog.askopenfilename(
                title="Locate ffprobe.exe",
                filetypes=[("ffprobe", "ffprobe.exe"), ("All files", "*.*")]
            )
            if path and Path(path).name.lower() == "ffprobe.exe":
                self.ffprobe_path = path
                self.cfg["ffprobe_path"] = path
                save_config(self.cfg)
                self.ffprobe_label.configure(text=f"ffprobe: {Path(path).name}", text_color="green")
            elif path:
                messagebox.showerror("Wrong File", "Please select ffprobe.exe")
                self._prompt_ffprobe()
        else:
            webbrowser.open("https://github.com/eugeneware/ffmpeg-static/releases")

    def _log(self, msg: str):
        self.log_box.configure(state="normal")
        self.log_box.insert("end", msg + "\n")
        self.log_box.see("end")
        self.log_box.configure(state="disabled")

    def _on_run(self):
        if self.running:
            return

        if not self.ffprobe_path:
            messagebox.showerror("Error", "ffprobe not configured. Please set it first.")
            self._prompt_ffprobe()
            return

        subtitles_dir = Path(self.sub_var.get().strip())
        videoclips_dir = Path(self.vid_var.get().strip())
        output_dir = Path(self.out_var.get().strip())

        if not subtitles_dir.is_dir():
            messagebox.showerror("Error", f"Subtitles folder not found:\n{subtitles_dir}")
            return
        if not videoclips_dir.is_dir():
            messagebox.showerror("Error", f"Video Clips folder not found:\n{videoclips_dir}")
            return

        try:
            max_age = int(self.age_var.get())
            gap_ms = int(self.gap_var.get())
            extend_ms = int(self.extend_var.get())
        except ValueError:
            messagebox.showerror("Error", "Numeric fields must be valid integers.")
            return

        self.cfg.update({
            "subtitles_dir": str(subtitles_dir),
            "videoclips_dir": str(videoclips_dir),
            "output_dir": str(output_dir),
            "max_age_days": max_age,
            "gap_threshold_ms": gap_ms,
            "extend_beyond_ms": extend_ms,
            "ffprobe_path": self.ffprobe_path,
        })
        save_config(self.cfg)

        output_dir.mkdir(parents=True, exist_ok=True)

        self.running = True
        self.run_btn.configure(state="disabled", text="Running...")
        self.log_box.configure(state="normal")
        self.log_box.delete("1.0", "end")
        self.log_box.configure(state="disabled")
        self.progress.set(0)
        self.progress_label.configure(text="")

        thread = threading.Thread(target=self._run_worker, args=(
            subtitles_dir, videoclips_dir, output_dir, max_age, gap_ms, extend_ms
        ), daemon=True)
        thread.start()

    def _run_worker(self, subtitles_dir, videoclips_dir, output_dir, max_age, gap_ms, extend_ms):
        srt_files = sorted(subtitles_dir.glob("*.srt"))
        total = len(srt_files)
        adjusted = 0
        skipped_old = 0
        skipped_no_video = 0
        skipped_error = 0
        skipped_gap = 0

        self._log(f"Found {total} SRT files in {subtitles_dir}")
        self._log(f"Checking files modified within the last {max_age} days...")
        self._log("")

        for i, srt_path in enumerate(srt_files, 1):
            name = srt_path.stem
            video_path = videoclips_dir / f"{name}.mp4"

            self.after(0, self._update_progress, i, total)

            if i % 50 == 0 or i == total:
                self._log(f"Progress: {i}/{total}")

            if not is_recently_modified(srt_path, max_age):
                skipped_old += 1
                continue

            if not video_path.exists():
                skipped_no_video += 1
                continue

            result = parse_last_timestamp(srt_path)
            if result is None:
                skipped_error += 1
                self._log(f"  SKIP (no timestamps): {srt_path.name}")
                continue

            last_start_ms, last_end_ms = result

            duration_ms = get_video_duration_ms(self.ffprobe_path, video_path)
            if duration_ms is None:
                skipped_error += 1
                continue

            gap = duration_ms - last_end_ms

            if gap > 0 and gap <= gap_ms:
                new_end_ms = duration_ms + extend_ms
                new_content = build_new_srt(srt_path, new_end_ms)
                output_path = output_dir / srt_path.name
                output_path.write_text(new_content, encoding="utf-8")
                adjusted += 1
                self._log(
                    f"  ADJUSTED: {srt_path.name} | gap={gap}ms | "
                    f"last_end={ms_to_timestamp(last_end_ms)} -> {ms_to_timestamp(new_end_ms)} | "
                    f"video={ms_to_timestamp(duration_ms)}"
                )
            else:
                skipped_gap += 1

        self._log("")
        self._log("=" * 60)
        self._log("Done!")
        self._log(f"  Adjusted & saved:  {adjusted}")
        self._log(f"  Skipped (gap):     {skipped_gap}")
        self._log(f"  Skipped (old):     {skipped_old}")
        self._log(f"  Skipped (no video):{skipped_no_video}")
        self._log(f"  Skipped (error):   {skipped_error}")
        self._log(f"  Output directory:  {output_dir}")

        self.after(0, self._run_finished)

    def _update_progress(self, current, total):
        self.progress.set(current / total)
        self.progress_label.configure(text=f"{current}/{total} files processed")

    def _run_finished(self):
        self.running = False
        self.run_btn.configure(state="normal", text="  Run  ")


if __name__ == "__main__":
    app = App()
    app.mainloop()
