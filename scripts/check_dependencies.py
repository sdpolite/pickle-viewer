import sys

required_packages = ["numpy", "pandas", "joblib"]
missing_packages = []

for package in required_packages:
    try:
        __import__(package)
    except ImportError:
        missing_packages.append(package)

if missing_packages:
    print(f"Missing packages: {', '.join(missing_packages)}")
    sys.exit(1)  # エラーコード 1 を返す
else:
    print("All required packages are installed.")
