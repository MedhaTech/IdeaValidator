from flask import Flask, request, jsonify, send_file, session, current_app
from flask_cors import CORS
import pandas as pd
import numpy as np 
import os
import sqlite3
from collections import Counter
import traceback
import io
import uuid 
import time 
import logging 
import re 
app = Flask(__name__)
app.secret_key = 'secret@123' 
CORS(app, supports_credentials=True)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
DEFAULT_USERNAME = 'admin' 
DEFAULT_PASSWORD = 'admin@123'

# Directory for temporary processed files
TEMP_FILE_DIR = 'temp_processed_files'
def init_db():
    # Ensure the temporary file directory exists
    if not os.path.exists(TEMP_FILE_DIR):
        os.makedirs(TEMP_FILE_DIR)
        logging.info(f"Created temporary file directory: {TEMP_FILE_DIR}")

    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password TEXT)')
    # Insert or ignore the default user, so it's only added once
    c.execute('INSERT OR IGNORE INTO users VALUES (?, ?)', (DEFAULT_USERNAME, DEFAULT_PASSWORD))
    conn.commit()
    conn.close()
    logging.info("Database initialized with default user.")
    current_app.config['FILTER_CATEGORIES'] = [
        "Agriculture and Rural Development",
        "Digital Transformation",
        "Economic Empowerment",
        "Health and Well-being",
        "Quality Education",
        "Smart and Resilient Communities",
        "Sustainable Development and Environment",
        "Others"
    ]

    normalized_map = {}
    for cat in current_app.config['FILTER_CATEGORIES']:
        normalized_map[cat.strip().lower()] = cat
    current_app.config['NORMALIZED_CATEGORY_MAP'] = normalized_map
    logging.info("Filter categories and normalized map initialized and stored in app.config.")


# Register init_db to run on app startup
with app.app_context():
    init_db()
INCOMPLETE_PLACEHOLDERS = {
    "", "none", "na", "n/a", "xxxxx", "xxxxxxxx",
    "ddddddddddddddddddddddddddddd", "ccccccccccccccccccccccccc",
    "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
}

def is_incomplete(text):
    """
    Checks if a given text value indicates incompleteness or placeholder content.
    This is a helper for run_detailed_validation_checks.
    """
    if pd.isna(text):
        return True
    text_lower = str(text).strip().lower()
    # Check for very long strings that consist of mostly repeated characters (e.g., "aaaaaaa...")
    if len(text_lower) > 5 and len(set(text_lower)) < 3:
        return True
    # Check against the predefined set of specific placeholder strings
    return text_lower in INCOMPLETE_PLACEHOLDERS

# Helper for email validation
EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
def is_valid_email(email):
    if pd.isna(email) or str(email).strip() == '':
        return False # Consider empty email as invalid
    return bool(EMAIL_REGEX.match(str(email).strip()))

def run_detailed_validation_checks(row):
    """
    Runs detailed validation checks on a single row and returns a list of rejection reasons.
    This is where your specific business logic for validation goes.
    """
    rejection_reasons = []

    # Safely get and normalize text fields for detailed checks
    title = str(row.get('Title of your idea (Think of a proper name. Dont describe the solution or problem statement here.', '')).strip().lower()
    problem = str(row.get('Write down your Problem statement', '')).strip().lower()
    solution = str(row.get('Describe the solution to the problem your team found. Explain your solution clearly - how does it work, who is it helping, and how will it solve the problem.', '')).strip().lower()
    if is_incomplete(title) or is_incomplete(problem) or is_incomplete(solution):
        rejection_reasons.append("Not filled - Inaccurate data (form is not filled properly)")

    if len(problem.split()) < 10 or len(solution.split()) < 10:
        rejection_reasons.append("Not understandable - Idea Submission does not have proper details to make a decision.")

    problem_words = problem.split()[:5]
    # Ensure problem_words is not empty to avoid error if problem is too short
    if problem_words and not any(word in solution for word in problem_words):
        rejection_reasons.append("Not useful - Idea does not solve the problem identified / problem & solution not connected.")

    # "Not novel - Idea and problem common and already in use."
    common_problem_phrases = ["pollution", "global warming", "heavy school bag", "bad roads", "waste di"]
    if any(phrase in problem for phrase in common_problem_phrases):
        rejection_reasons.append("Not novel - Idea and problem common and already in use.")

    # "Not novel - Idea has been 100% plagiarized."
    plagiarized_titles = ["smart school bag", "advance drainage system", "green robot", "traffic light automation"]
    if title in plagiarized_titles:
        rejection_reasons.append("Not novel - Idea has been 100% plagiarized.")

    # "Not clear (usefulness)"
    if "useful" not in solution and "benefit" not in solution and "impact" not in solution:
        rejection_reasons.append("Not clear (usefulness)")

    return ", ".join(rejection_reasons) if rejection_reasons else pd.NA

# --- Login Endpoint ---
@app.route('/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('SELECT * FROM users WHERE username = ? AND password = ?', (username, password))
    user = c.fetchone()
    conn.close()

    if user:
        session['logged_in'] = True
        logging.info(f"User '{username}' logged in successfully.")
        return jsonify({'message': 'Login successful'}), 200
    else:
        logging.warning(f"Failed login attempt for username: '{username}')")
        return jsonify({'message': 'Invalid credentials'}), 401

# --- Upload Endpoint ---
@app.route('/upload', methods=['POST'])
def upload_file():
    if not session.get('logged_in'):
        logging.warning("Unauthorized access attempt to /upload.")
        return jsonify({'message': 'Unauthorized'}), 401

    if 'file' not in request.files:
        logging.error("No 'file' part in request.")
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        logging.error("No selected file in request.")
        return jsonify({'error': 'No selected file'}), 400

    if file:
        try:
            logging.info(f"Received file: {file.filename}")
            file_extension = os.path.splitext(file.filename)[1].lower()

            if file_extension == '.csv':
                # Attempt to read CSV with utf-8, fall back to latin1 if decoding error occurs
                file_content = file.stream.read()
                try:
                    df = pd.read_csv(io.StringIO(file_content.decode('utf-8')))
                except UnicodeDecodeError:
                    logging.warning("UTF-8 decode failed for CSV, trying latin1 encoding.")
                    df = pd.read_csv(io.StringIO(file_content.decode('latin1')))
            elif file_extension == '.xlsx':
                df = pd.read_excel(file.stream) # pd.read_excel can directly read the stream
            else:
                logging.error(f"Unsupported file type: {file_extension}")
                return jsonify({'error': f'Unsupported file type: {file_extension}. Please upload a CSV or XLSX file.'}), 400

            logging.info(f"Successfully read file with {len(df)} rows.")

            df['Validator_Raw_Rejection_Reasons'] = df.apply(run_detailed_validation_checks, axis=1)
            logging.info("Completed detailed validation checks.")

            # Determine the name of the final status column: use 'L1 Status' if it exists, else 'Validation Status'
            final_status_column_name = 'L1 Status' if 'L1 Status' in df.columns else 'Validation Status'
            df[final_status_column_name] = np.where(df['Validator_Raw_Rejection_Reasons'].isna(), 'Accepted', 'Rejected')
            logging.info(f"Calculated '{final_status_column_name}' based on detailed rejection reasons.")
            df['Rejection Reason(s)'] = df.apply(
                lambda row: row['Validator_Raw_Rejection_Reasons'] if row[final_status_column_name] == 'Rejected' else pd.NA,
                axis=1
            )
            logging.info("Prepared 'Rejection Reason(s)' for output based on L1 status.")
            total_rows = len(df)
            clean_rows = df['Validator_Raw_Rejection_Reasons'].isna().sum()
            validation_percentage = (clean_rows / total_rows * 100) if total_rows > 0 else 0
            logging.info(f"Calculated overall validation percentage: {validation_percentage:.2f}%")


            # --- Generate Summary Statistics for Frontend ---
            status_counts = df[final_status_column_name].value_counts().to_dict() # Use the final status column
            # Convert int64 to standard Python int for JSON serialization
            status_counts = {k: int(v) for k, v in status_counts.items()}
            logging.info(f"Generated status counts: {status_counts}")

            # Filter Summary (e.g., by 'Theme' or 'Focus Area')
            filter_summary_list = []
            category_column = 'Theme' # Default to 'Theme'
            if 'Theme' not in df.columns and 'Focus Area' in df.columns:
                category_column = 'Focus Area' # Fallback to 'Focus Area' if Theme is missing
            elif 'Theme' not in df.columns and 'Focus Area' not in df.columns:
                logging.warning("Neither 'Theme' nor 'Focus Area' column found for filter summary.")
                category_column = None # No category column available

            if category_column:
                # Access NORMALIZED_CATEGORY_MAP from current_app.config
                NORMALIZED_CATEGORY_MAP = current_app.config['NORMALIZED_CATEGORY_MAP']
                filter_categories = current_app.config['FILTER_CATEGORIES']

                # Normalize categories using the predefined map
                df['Normalized_Category'] = df[category_column].apply(
                    lambda x: NORMALIZED_CATEGORY_MAP.get(str(x).strip().lower(), 'Others')
                    if pd.notna(x) else 'Others'
                )
                theme_status_counts = df.groupby('Normalized_Category')[final_status_column_name].value_counts().unstack(fill_value=0) # Use final status column
                for cat in filter_categories: # Use the list from app.config
                    if cat not in theme_status_counts.index:
                        theme_status_counts.loc[cat] = 0 # Add a row of zeros for missing categories

                theme_status_counts = theme_status_counts.reindex(filter_categories, fill_value=0) # Use the list from app.config

                for theme, counts in theme_status_counts.iterrows():
                    filter_summary_list.append({
                        'Category': theme,
                        'Accepted': int(counts.get('Accepted', 0)), # Convert to int
                        'Rejected': int(counts.get('Rejected', 0)), # Convert to int
                        'Under Review': int(counts.get('Under Review', 0)) # Will always be 0 with new primary status logic
                    })
                logging.info(f"Generated filter summary for '{category_column}'.")
            else:
                logging.info("Skipping filter summary generation due to missing category columns.")

            all_rejection_reasons_summary = {}
            rejected_ideas_df = df[df[final_status_column_name] == 'Rejected'] # Use the final status column
            if 'Rejection Reason(s)' in rejected_ideas_df.columns:
                valid_reasons = rejected_ideas_df['Rejection Reason(s)'].dropna().astype(str)
                for reasons_str in valid_reasons:
                    for reason in reasons_str.split(','):
                        reason = reason.strip()
                        if reason:
                            all_rejection_reasons_summary[reason] = int(all_rejection_reasons_summary.get(reason, 0) + 1) # Convert to int
            logging.info("Generated all rejection reasons summary.")

            if 'Rejection Reason(s)' in df.columns:
                df['Rejection Reason(s)'] = df['Rejection Reason(s)'].fillna('')

            # Drop the temporary 'Normalized_Category' column before saving to CSV
            if 'Normalized_Category' in df.columns:
                df = df.drop(columns=['Normalized_Category'])

            if 'Validator_Raw_Rejection_Reasons' in df.columns:
                df = df.drop(columns=['Validator_Raw_Rejection_Reasons'])


            # --- Store the processed DataFrame to a temporary file for download ---
            file_id = str(uuid.uuid4())
            temp_file_path = os.path.join(TEMP_FILE_DIR, f'validated_output_{file_id}.csv')
            df.to_csv(temp_file_path, index=False)
            logging.info(f"Processed DataFrame saved to temporary file: {temp_file_path}")

            # Store only the file path in the session
            session['processed_file_path'] = temp_file_path
            session['processed_file_timestamp'] = time.time() # Store timestamp for cleanup

            return jsonify({
                'message': 'File validated successfully',
                'status_summary': status_counts,
                'filter_summary': filter_summary_list,
                'summary': all_rejection_reasons_summary,
                'validation_percentage': round(validation_percentage, 2) # Add the new percentage
            }), 200

        except Exception as e:
            logging.error(f"Error during file processing: {e}", exc_info=True)
            return jsonify({'error': f'Failed to process file: {str(e)}'}), 500

    return jsonify({'error': 'Something went wrong'}), 500

# --- Download Endpoint ---
@app.route('/download', methods=['GET'])
def download_file():
    if not session.get('logged_in'):
        logging.warning("Unauthorized access attempt to /download.")
        return jsonify({'message': 'Unauthorized'}), 401

    processed_file_path = session.get('processed_file_path')
    if not processed_file_path or not os.path.exists(processed_file_path):
        logging.error(f"Processed file not found or path missing: {processed_file_path}")
        return jsonify({'error': 'No processed file available for download. Please upload and validate a file first.'}), 404

    try:
        logging.info(f"Serving file for download: {processed_file_path}")
        return send_file(
            processed_file_path,
            mimetype='text/csv',
            as_attachment=True,
            download_name='validated_output.csv'
        )
    except Exception as e:
        logging.error(f"Error serving file for download: {e}", exc_info=True)
        return jsonify({'error': f'Failed to download file: {str(e)}'}), 500

# --- Cleanup old temporary files (optional, but good practice) ---
@app.before_request
def cleanup_old_files():
    os.makedirs(TEMP_FILE_DIR, exist_ok=True)
    if os.path.exists(TEMP_FILE_DIR):
        cleanup_threshold = time.time() - 3600
        for filename in os.listdir(TEMP_FILE_DIR):
            file_path = os.path.join(TEMP_FILE_DIR, filename)
            if os.path.isfile(file_path):
                file_timestamp = os.path.getmtime(file_path)
                if file_timestamp < cleanup_threshold:
                    try:
                        os.remove(file_path)
                        logging.info(f"Cleaned up old temporary file: {file_path}")
                    except Exception as e:
                        logging.error(f"Error cleaning up file {file_path}: {e}")
    else:
        logging.warning(f"Temporary directory '{TEMP_FILE_DIR}' not found during cleanup attempt. Skipping cleanup.")

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000)
