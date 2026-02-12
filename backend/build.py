import os
import subprocess
import sys
import shutil

def run_command(command):
    print(f"Running: {command}")
    subprocess.check_call(command, shell=True)

def build_backend():
    print("Building Python backend...")

    # Ensure we are in the PROJECT ROOT
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.join(backend_dir, "..")
    os.chdir(project_root)

    # Detect Virtual Environment
    if sys.platform == "win32":
        venv_python = os.path.join(project_root, "venv", "Scripts", "python.exe")
    else:
        venv_python = os.path.join(project_root, "venv", "bin", "python")

    if not os.path.exists(venv_python):
        print(f"Error: Virtual environment not found at {venv_python}")
        print("Please run 'python3 -m venv venv' in the project root first.")
        sys.exit(1)

    print(f"Using Python from: {venv_python}")

    # Install dependencies
    print("Installing dependencies...")
    run_command(f"\"{venv_python}\" -m pip install -r backend/requirements.txt")

    # Clean previous builds (in backend/)
    if os.path.exists("backend/dist"):
        shutil.rmtree("backend/dist")
    if os.path.exists("backend/build"):
        shutil.rmtree("backend/build")

    # Run PyInstaller from ROOT
    # This ensures 'backend' package is resolvable
    
    print("Running PyInstaller...")
    
    hidden_imports = " ".join([
        "--hidden-import=uvicorn.logging",
        "--hidden-import=uvicorn.loops",
        "--hidden-import=uvicorn.loops.auto",
        "--hidden-import=uvicorn.protocols",
        "--hidden-import=uvicorn.protocols.http",
        "--hidden-import=uvicorn.protocols.http.auto",
        "--hidden-import=uvicorn.lifespan",
        "--hidden-import=uvicorn.lifespan.on",
        "--hidden-import=engineio.async_drivers.aiohttp",
        "--hidden-import=backend.agent", 
        "--hidden-import=backend.server",
    ])

    cmd = (
        f"\"{venv_python}\" -m PyInstaller backend/server.py "
        f"--name anthracite-server "
        f"--onefile "
        f"--noconsole "
        f"--clean "
        f"{hidden_imports} "
        f"--distpath backend/dist "
        f"--workpath backend/build "
        f"--specpath backend "
    )
    
    run_command(cmd)

    print("Build complete. Artifacts in backend/dist/anthracite-server")

if __name__ == "__main__":
    build_backend()
