import os
import sys
import json
import pandas as pd
import pickle
import joblib

# デバッグモードのフラグ（デフォルトはFalse）
DEBUG_MODE = False  # デバッグ時のみTrueに変更

# ログファイルのパスを指定（必要に応じて変更）
LOG_FILE_PATH = "/home/user1/dev/pickle-viewer/scripts/debug.log"

def log_message(message):
    """デバッグ用のメッセージをログファイルに記録"""
    if DEBUG_MODE:  # デバッグモードが有効な場合のみログを記録
        with open(LOG_FILE_PATH, "a") as log_file:
            log_file.write(message + "\n")

def read_pickle(file_path, start, end):
    try:
        log_message(f"DEBUG: Start reading file {file_path}")
        
        with open(file_path, "rb") as f:
            try:
                data = pickle.load(f)
                log_message("DEBUG: Successfully loaded data using pickle")
            except Exception:
                data = joblib.load(file_path)
                log_message("DEBUG: Successfully loaded data using joblib")

        # 総行数のみを返す
        if start == 0 and end == -1:
            if isinstance(data, pd.DataFrame):
                total_rows = len(data)
                log_message(f"DEBUG: Total rows in DataFrame: {total_rows}")
                print(json.dumps({"totalRows": total_rows}))
            elif isinstance(data, list):
                total_rows = len(data)
                log_message(f"DEBUG: Total rows in list: {total_rows}")
                print(json.dumps({"totalRows": total_rows}))
            else:
                log_message("DEBUG: Unsupported data type for total rows")
                print(json.dumps({"error": "Unsupported data type"}))
            return

        # 指定範囲のデータを返す
        if isinstance(data, pd.DataFrame):
            result_data = data.iloc[start:end].reset_index()
            # 全列を確認し、datetime型またはdate型ならフォーマットを適用
            for column in result_data.columns:
                if pd.api.types.is_datetime64_any_dtype(result_data[column]):
                    # datetime型のフォーマット
                    result_data[column] = result_data[column].dt.strftime('%Y-%m-%d %H:%M:%S')
                elif pd.api.types.is_object_dtype(result_data[column]) and \
                    result_data[column].str.match(r'^\d{4}-\d{2}-\d{2}$', na=False).all():
                    # date型のフォーマット
                    result_data[column] = pd.to_datetime(result_data[column]).dt.strftime('%Y-%m-%d')
            log_message(f"DEBUG: Returning rows {start} to {end} from DataFrame")
            result = result_data.to_json(orient="split")  # JSON形式でデータを出力
        elif isinstance(data, list):
            result_data = data[start:end].reset_index()
            # 全列を確認し、datetime型またはdate型ならフォーマットを適用
            for column in result_data.columns:
                if pd.api.types.is_datetime64_any_dtype(result_data[column]):
                    # datetime型のフォーマット
                    result_data[column] = result_data[column].dt.strftime('%Y-%m-%d %H:%M:%S')
                elif pd.api.types.is_object_dtype(result_data[column]) and \
                    result_data[column].str.match(r'^\d{4}-\d{2}-\d{2}$', na=False).all():
                    # date型のフォーマット
                    result_data[column] = pd.to_datetime(result_data[column]).dt.strftime('%Y-%m-%d')
            log_message(f"DEBUG: Returning rows {start} to {end} from list")
            result = json.dumps(result_data, default=str)
        else:
            log_message("DEBUG: Unsupported data type for range extraction")
            result = json.dumps({"error": "Unsupported data type"})
        print(result)

        log_message(f"DEBUG: Successfully processed range {start} to {end}")
    except Exception as e:
        log_message(f"ERROR: Exception occurred: {str(e)}")
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    if len(sys.argv) != 4:
        log_message("ERROR: Invalid number of arguments provided")
        print(json.dumps({"error": "Invalid arguments"}))
    else:
        file_path = sys.argv[1]
        start = int(sys.argv[2])
        end = int(sys.argv[3])
        read_pickle(file_path, start, end)
