@echo off
echo Running Vayu-AI Test Suite...
python -m pytest -p no:zarr tests/test_digital_twin_engine.py
python test_backend.py
pause
