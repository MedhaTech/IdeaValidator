from flask import Flask, request, jsonify, send_file, session, current_app
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
import random 
from langdetect import detect, DetectorFactory, LangDetectException
from concurrent.futures import ProcessPoolExecutor, as_completed
import psutil 
from flask_cors import CORS

DetectorFactory.seed = 0

app = Flask(__name__)
CORS(app, supports_credentials=True, origins=["http://localhost:3000"])
app.secret_key = 'secret@123' 

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
DEFAULT_USERNAME = 'admin'
DEFAULT_PASSWORD = 'admin@123' 

TEMP_FILE_DIR = 'temp_processed_files'

def init_db():
    if not os.path.exists(TEMP_FILE_DIR):
        os.makedirs(TEMP_FILE_DIR)
        logging.info(f"Created temporary file directory: {TEMP_FILE_DIR}")

    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, password TEXT)')
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

with app.app_context():
    init_db()

INCOMPLETE_PLACEHOLDERS = {
    "", "none", "na", "n/a", "xxxxx", "xxxxxxxx",
    "ddddddddddddddddddddddddddddd", "ccccccccccccccccccccccccc",
    "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "ccccccccccccccccccccccccccccccccccccctgtrgtrhrthtrh",
    "ddddddddddddddddddddddddddddd",
    "waste di",
    "testing", "test",
    "demo", "example",
    "asdf", "qwer", "zxcv"
}

def is_incomplete(text):
    if pd.isna(text):
        return True
    text_str = str(text).strip().lower()
    
    if not text_str:
        return True
    
    if text_str in INCOMPLETE_PLACEHOLDERS:
        return True

    alphabetic_text = re.sub(r'[^a-z]', '', text_str)
    if alphabetic_text:
        if len(alphabetic_text) > 8:
            char_counts = Counter(alphabetic_text)
            if char_counts:
                most_common_char, most_common_count = char_counts.most_common(1)[0]
                if most_common_count / len(alphabetic_text) > 0.8:
                    return True
    
    if len(text_str) > 5 and len(text_str) < 20 and len(set(text_str)) < 4:
        return True

    return False

EMAIL_REGEX = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
def is_valid_email(email):
    if pd.isna(email) or str(email).strip() == '':
        return False
    return bool(EMAIL_REGEX.match(str(email).strip()))

STOP_WORDS = set([
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', "you're", "you've", "you'll", "you'd", 'your', 'yours', 'yourself', 'yourselves',
    'he', 'him', 'his', 'himself', 'she', "she's", 'her', 'hers', 'herself', 'it', "it's", 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
    'what', 'which', 'who', 'whom', 'this', 'that', "that'll", 'these', 'those', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'having', 'do', 'does', 'did', 'doing', 'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with', 'about',
    'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under',
    'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', "don't", 'should', "should've", 'now', 'd', 'll',
    'm', 'o', 're', 've', 'y', 'ain', 'aren', "aren't", 'couldn', "couldn't", 'didn', "didn't", 'doesn', "doesn't", 'hadn', "hadn't", 'hasn', "hasn't", 'haven',
    "haven't", 'isn', "isn't", 'ma', 'mightn', "mightn't", 'mustn', "mustn't", 'needn', "needn't", 'shan', "shan't", 'shouldn', "shouldn't", 'wasn', "wasn't",
    'weren', "weren't", 'won', "won't", 'wouldn', "wouldn't"
])

def remove_stop_words(text):
    words = re.findall(r'\b\w+\b', text.lower())
    filtered_words = [word for word in words if word not in STOP_WORDS]
    return " ".join(filtered_words)

# This function is used to detect language for individual fields for rejection reasons.
def validate_field_language(text, expected_lang='en'):
    if pd.isna(text) or not str(text).strip():
        return True, "English (Default/Empty)"
    
    original_text = str(text).strip()
    cleaned_text = re.sub(r'[^a-zA-Z\s]', '', original_text)
    
    if len(cleaned_text) > 500:
        cleaned_text = cleaned_text[:500]

    if len(cleaned_text.split()) < 3 or len(cleaned_text.replace(" ", "")) < 10:
        return False, "Too short to determine" 
    
    try:
        detected_lang_code = detect(cleaned_text)
        if detected_lang_code == expected_lang:
            return True, "English"
        else:
            display_string = f"Detected Language (Code: {detected_lang_code.upper()})"
            return False, display_string
    except LangDetectException:
        return False, "Undetermined"
    except Exception as e:
        return False, "Error during detection"

# This function is used for the new 'Detected Language' column.
def detect_combined_language(row):
    title_orig = str(row.get('Title of your idea (Think of a proper name. Dont describe the solution or problem statement here.', '')).strip()
    problem_orig = str(row.get('Write down your Problem statement', '')).strip()
    solution_orig = str(row.get('Describe the solution to the problem your team found. Explain your solution clearly - how does it work, who is it helping, and how will it solve the problem.', '')).strip()

    combined_text = ' '.join(filter(None, [title_orig, problem_orig, solution_orig]))

    if not combined_text:
        return "Not available"

    try:
        detected_lang_code = detect(combined_text)
        return f"Detected Language (Code: {detected_lang_code.upper()})"
    except LangDetectException:
        return "Undetermined"
    except Exception as e:
        return "Error during detection"

def run_detailed_validation_checks(row):
    rejection_reasons = []

    title_orig = str(row.get('Title of your idea (Think of a proper name. Dont describe the solution or problem statement here.', '')).strip()
    problem_orig = str(row.get('Write down your Problem statement', '')).strip()
    solution_orig = str(row.get('Describe the solution to the problem your team found. Explain your solution clearly - how does it work, who is it helping, and how will it solve the problem.', '')).strip()

    # --- Language & Incomplete Checks ---
    is_title_lang_ok, detected_title_lang_display = validate_field_language(title_orig, expected_lang='en')
    if is_incomplete(title_orig):
        rejection_reasons.append("Not filled - Inaccurate data (form is not filled properly) - Title.")
    elif not is_title_lang_ok and "English" not in detected_title_lang_display:
        rejection_reasons.append("Incorrect Language - Title.")
    
    is_problem_lang_ok, detected_problem_lang_display = validate_field_language(problem_orig, expected_lang='en')
    if is_incomplete(problem_orig):
        rejection_reasons.append("Not filled - Inaccurate data (form is not filled properly) - Problem statement.")
    elif not is_problem_lang_ok and "English" not in detected_problem_lang_display:
        rejection_reasons.append("Incorrect Language - Problem statement.")

    is_solution_lang_ok, detected_solution_lang_display = validate_field_language(solution_orig, expected_lang='en')
    if is_incomplete(solution_orig):
        rejection_reasons.append("Not filled - Inaccurate data (form is not filled properly) - Solution description.")
    elif not is_solution_lang_ok and "English" not in detected_solution_lang_display:
        rejection_reasons.append("Incorrect Language - Solution description.")

    # --- Other Content-based checks ---
    title_lower = title_orig.lower()
    problem_lower = problem_orig.lower()
    solution_lower = solution_orig.lower()

    if "Not filled - Inaccurate data (form is not filled properly) - Problem statement." not in rejection_reasons:
        if len(problem_lower.split()) < 10:
            rejection_reasons.append("Not understandable - Idea Submission does not have proper details to make a decision - Problem Statement too short.")
    
    if "Not filled - Inaccurate data (form is not filled properly) - Solution description." not in rejection_reasons:
        if len(solution_lower.split()) < 10:
            rejection_reasons.append("Not understandable - Idea Submission does not have proper details to make a decision - Solution Description too short.")
        
        vague_solution_keywords = ["try to", "aim to", "hope to", "might", "could", "possibly", "maybe", "unclear", "not sure", "theoretical", "requires funding", "needs more research"]
        problem_solving_action_keywords = ["solve", "reduce", "improve", "create", "develop", "implement", "address", "mitigate", "enhance", "build"]

        solution_contains_vague_keyword = any(keyword in solution_lower for keyword in vague_solution_keywords)
        solution_contains_action_keyword = any(keyword in solution_lower for keyword in problem_solving_action_keywords)

        if not solution_contains_vague_keyword and solution_lower.strip(): 
            cleaned_problem = remove_stop_words(problem_lower)
            cleaned_solution = remove_stop_words(solution_lower)

            problem_unique_words = set(word for word in cleaned_problem.split() if len(word) > 2)
            solution_unique_words = set(word for word in cleaned_solution.split() if len(word) > 2)

            low_overlap = False
            if problem_unique_words and solution_unique_words:
                common_words = problem_unique_words.intersection(solution_unique_words)
                if len(common_words) < 0.2 * len(problem_unique_words):
                    low_overlap = True
            elif problem_unique_words and not solution_unique_words:
                low_overlap = True

            if solution_contains_vague_keyword or (len(problem_lower.split()) > 0 and not solution_contains_action_keyword) or low_overlap:
                rejection_reasons.append("Not useful - Idea does not solve the problem identified / problem & solution not connected.")

        cleaned_problem_for_novelty = remove_stop_words(problem_lower)
        common_problem_keywords = [
            "water", "waste", "pollution", "traffic", "health", "education", "energy", "farming",
            "climate", "environment", "sanitation", "disease", "poverty", "unemployment",
            "safety", "security", "food", "literacy", "digital divide", "cleanliness",
            "transportation", "disaster", "natural resources", "infrastructure", "rural", "urban"
        ]
        if any(keyword in cleaned_problem_for_novelty for keyword in common_problem_keywords):
            rejection_reasons.append("Not novel - Idea and problem common and already in use.")

        if len(solution_lower.split()) < 50 and not is_incomplete(solution_lower):
            rejection_reasons.append("Not clear (usefulness) - Solution too brief or vague.")

    return ", ".join(rejection_reasons) if rejection_reasons else pd.NA


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

            file_content_bytes = file.read() 
            
            if file_extension == '.csv':
                try:
                    df = pd.read_csv(io.StringIO(file_content_bytes.decode('utf-8')))
                except UnicodeDecodeError:
                    logging.warning("UTF-8 decode failed for CSV, trying latin1 encoding.")
                    df = pd.read_csv(io.StringIO(file_content_bytes.decode('latin1')))
            elif file_extension == '.xlsx':
                df = pd.read_excel(io.BytesIO(file_content_bytes))
            else:
                logging.error(f"Unsupported file type: {file_extension}")
                return jsonify({'error': f'Unsupported file type: {file_extension}. Please upload a CSV or XLSX file.'}), 400

            logging.info(f"Successfully read file with {len(df)} rows.")

            max_workers = psutil.cpu_count(logical=False)
            if max_workers is None:
                max_workers = os.cpu_count() or 4

            logging.info(f"Starting parallel processing with {max_workers} workers.")
            
            num_chunks = max_workers * 2 if len(df) > max_workers * 2 else len(df)
            df_chunks = np.array_split(df, num_chunks)
            
            results_reasons = []
            results_language = []
            
            with ProcessPoolExecutor(max_workers=max_workers) as executor:
                future_to_chunk_reasons = {executor.submit(chunk.apply, run_detailed_validation_checks, axis=1): i for i, chunk in enumerate(df_chunks)}
                for future in as_completed(future_to_chunk_reasons):
                    try:
                        results_reasons.extend(future.result())
                    except Exception as exc:
                        logging.error(f'Reasons chunk generated an exception: {exc}', exc_info=True)
                        results_reasons.extend([pd.NA] * len(df_chunks[future_to_chunk_reasons[future]]))

                future_to_chunk_lang = {executor.submit(chunk.apply, detect_combined_language, axis=1): i for i, chunk in enumerate(df_chunks)}
                for future in as_completed(future_to_chunk_lang):
                    try:
                        results_language.extend(future.result())
                    except Exception as exc:
                        logging.error(f'Language chunk generated an exception: {exc}', exc_info=True)
                        results_language.extend([pd.NA] * len(df_chunks[future_to_chunk_lang[future]]))

            df['Validator_Raw_Rejection_Reasons'] = results_reasons
            df['Detected Language'] = results_language

            logging.info("Completed parallel validation checks and added language column.")

            original_l1_status_exists = 'L1 Status' in df.columns
            final_status_column_name = 'L1 Status' if original_l1_status_exists else 'Validation Status'

            if not original_l1_status_exists:
                df[final_status_column_name] = np.where(df['Validator_Raw_Rejection_Reasons'].isna(), 'Accepted', 'Rejected')
                logging.info(f"Calculated '{final_status_column_name}' based on detailed rejection reasons.")
                df['Rejection Reason(s)'] = df.apply(
                    lambda row: row['Validator_Raw_Rejection_Reasons'] if row[final_status_column_name] == 'Rejected' else pd.NA,
                    axis=1
                )
                logging.info("Prepared 'Rejection Reason(s)' for output based on calculated status.")
            else:
                df['Rejection Reason(s)'] = df.apply(
                    lambda row: row['Validator_Raw_Rejection_Reasons']
                    if str(row.get('L1 Status', '')).strip().lower() == 'rejected'
                    else pd.NA,
                    axis=1
                )
                logging.info("Preserved original 'L1 Status'. Prepared 'Rejection Reason(s)' based on detailed checks AND original L1 Status.")

            total_rows = len(df)
            clean_rows = df['Validator_Raw_Rejection_Reasons'].isna().sum()
            validation_percentage = (clean_rows / total_rows * 100) if total_rows > 0 else 0
            logging.info(f"Calculated overall validation percentage: {validation_percentage:.2f}%")

            status_counts = df[final_status_column_name].value_counts().to_dict()
            status_counts = {k: int(v) for k, v in status_counts.items()}
            logging.info(f"Generated status counts for '{final_status_column_name}': {status_counts}")

            filter_summary_list = []
            category_column = 'Theme'
            if 'Theme' not in df.columns and 'Focus Area' in df.columns:
                category_column = 'Focus Area'
            elif 'Theme' not in df.columns and 'Focus Area' not in df.columns:
                logging.warning("Neither 'Theme' nor 'Focus Area' column found for filter summary.")
                category_column = None

            if category_column:
                NORMALIZED_CATEGORY_MAP = current_app.config['NORMALIZED_CATEGORY_MAP']
                filter_categories = current_app.config['FILTER_CATEGORIES']

                df['Normalized_Category'] = df[category_column].apply(
                    lambda x: NORMALIZED_CATEGORY_MAP.get(str(x).strip().lower(), 'Others')
                    if pd.notna(x) else 'Others'
                )
                theme_status_counts = df.groupby('Normalized_Category')[final_status_column_name].value_counts().unstack(fill_value=0)

                for cat in filter_categories:
                    if cat not in theme_status_counts.index:
                        theme_status_counts.loc[cat] = 0

                theme_status_counts = theme_status_counts.reindex(filter_categories, fill_value=0)

                for theme, counts in theme_status_counts.iterrows():
                    filter_summary_list.append({
                        'Category': theme,
                        'Accepted': int(counts.get('Accepted', 0)),
                        'Rejected': int(counts.get('Rejected', 0)),
                        'Under Review': int(counts.get('Under Review', 0))
                    })
                logging.info(f"Generated filter summary for '{category_column}'.")
            else:
                logging.info("Skipping filter summary generation due to missing category columns.")

            all_rejection_reasons_summary = {}
            rejected_ideas_for_summary_df = df[df[final_status_column_name].astype(str).str.strip().str.lower() == 'rejected']
            if 'Rejection Reason(s)' in rejected_ideas_for_summary_df.columns:
                valid_reasons = rejected_ideas_for_summary_df['Rejection Reason(s)'].dropna().astype(str)
                for reasons_str in valid_reasons:
                    for reason in reasons_str.split(','):
                        reason = reason.strip()
                        if reason:
                            all_rejection_reasons_summary[reason] = int(all_rejection_reasons_summary.get(reason, 0) + 1)
            
            sorted_summary = sorted(all_rejection_reasons_summary.items(), key=lambda item: item[1], reverse=True)
            all_rejection_reasons_summary = dict(sorted_summary[:5])

            logging.info("Generated all rejection reasons summary from final 'Rejection Reason(s)' column.")

            if 'Rejection Reason(s)' in df.columns:
                df['Rejection Reason(s)'] = df['Rejection Reason(s)'].fillna('')

            if 'Normalized_Category' in df.columns:
                df = df.drop(columns=['Normalized_Category'])

            if 'Validator_Raw_Rejection_Reasons' in df.columns:
                df = df.drop(columns=['Validator_Raw_Rejection_Reasons'])

            file_id = str(uuid.uuid4())
            temp_file_path = os.path.join(TEMP_FILE_DIR, f'validated_output_{file_id}.csv')
            df.to_csv(temp_file_path, index=False)
            logging.info(f"Processed DataFrame saved to temporary file: {temp_file_path}")

            session['processed_file_path'] = temp_file_path
            session['processed_file_timestamp'] = time.time()

            return jsonify({
                'message': 'File validated successfully',
                'status_summary': status_counts,
                'filter_summary': filter_summary_list,
                'summary': all_rejection_reasons_summary,
                'validation_percentage': round(validation_percentage, 2)
            }), 200

        except Exception as e:
            logging.error(f"Error during file processing: {e}", exc_info=True)
            return jsonify({'error': f'Failed to process file: {str(e)}'}), 500

    return jsonify({'error': 'Something went wrong'}), 500

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

@app.route('/logout', methods=['POST'])
def logout():
    session.pop('logged_in', None)
    if 'processed_file_path' in session:
        file_to_delete = session.pop('processed_file_path', None)
        if file_to_delete and os.path.exists(file_to_delete):
            try:
                os.remove(file_to_delete)
                logging.info(f"Cleaned up processed file on logout: {file_to_delete}")
            except Exception as e:
                logging.error(f"Error cleaning up file {file_to_delete} on logout: {e}")
    logging.info("User logged out.")
    return jsonify({"message": "Logout successful"}), 200

@app.route('/detect_file_language', methods=['POST'])
def detect_file_language():
    if not session.get('logged_in'):
        return jsonify({"message": "Unauthorized"}), 401

    if 'file' not in request.files:
        logging.error("No 'file' part in /detect_file_language request.")
        return jsonify({"language": "Could not detect language."}), 200

    file = request.files['file']

    if file.filename == '':
        logging.error("No selected file in /detect_file_language request.")
        return jsonify({"language": "Could not detect language."}), 200

    if file:
        try:
            file_content_bytes = file.read()
            df = None
            original_filename = file.filename
            file_extension = os.path.splitext(original_filename)[1].lower()

            if file_extension == '.csv':
                try:
                    df = pd.read_csv(io.StringIO(file_content_bytes.decode('utf-8')))
                except UnicodeDecodeError:
                    df = pd.read_csv(io.StringIO(file_content_bytes.decode('latin1')))
            elif file_extension == '.xlsx':
                df = pd.read_excel(io.BytesIO(file_content_bytes))
            else:
                return jsonify({"language": "Unsupported file type for language detection"}), 200

            sample_text = ""
            potential_text_cols = [
                'Title of your idea (Think of a proper name. Dont describe the solution or problem statement here.',
                'Write down your Problem statement',
                'Describe the solution to the problem your team found. Explain your solution clearly - how does it work, who is it helping, and how will it solve the problem.'
            ]
            
            for col_name in potential_text_cols:
                if col_name in df.columns:
                    text_values = df[col_name].dropna().astype(str).tolist()
                    if text_values:
                        sample_texts = random.sample(text_values, min(len(text_values), 100))
                        sample_text = ' '.join(sample_texts)
                        if len(sample_text) > 5000:
                            sample_text = sample_text[:5000]
                        if sample_text.strip():
                            break

            if not sample_text.strip():
                for col in df.columns:
                    if df[col].dtype == 'object':
                        text_values = df[col].dropna().astype(str).tolist()
                        if text_values:
                            sample_texts = random.sample(text_values, min(len(text_values), 100))
                            sample_text = ' '.join(sample_texts)
                            if len(sample_text) > 5000:
                                sample_text = sample_text[:5000]
                            if sample_text.strip():
                                break

            if not sample_text.strip():
                logging.info("No text content found for language detection in file.")
                return jsonify({"language": "No text content for detection"}), 200

            cleaned_sample_text = re.sub(r'[^a-zA-Z\s]', '', sample_text)

            if len(cleaned_sample_text.split()) < 3 or len(cleaned_sample_text.replace(" ", "")) < 10:
                return jsonify({"language": "Too short to determine"}), 200

            try:
                detected_lang_code = detect(cleaned_sample_text)
                
                if detected_lang_code == 'en':
                    display_lang = "English"
                else:
                    display_lang = f"Detected Language (Code: {detected_lang_code.upper()})"

                logging.info(f"Detected language for file: {display_lang}")
                
                return jsonify({"language": display_lang}), 200

            except LangDetectException:
                logging.warning(f"Could not reliably detect language for file.")
                return jsonify({"language": "Undetermined"}), 200
            except Exception as e:
                logging.error(f"General error during /detect_file_language: {e}", exc_info=True)
                return jsonify({"language": "Could not detect language."}), 200

        except Exception as e:
            logging.error(f"Error reading or processing file in /detect_file_language: {e}", exc_info=True)
            return jsonify({"language": "Could not detect language."}), 200

    return jsonify({"language": "No file received for detection"}), 200

@app.before_request
def cleanup_old_files():
    last_cleanup_time = getattr(cleanup_old_files, 'last_cleanup_time', 0)
    if time.time() - last_cleanup_time > 600:
        os.makedirs(TEMP_FILE_DIR, exist_ok=True)
        if os.path.exists(TEMP_FILE_DIR):
            cleanup_threshold = time.time() - 3600
            for filename in os.listdir(TEMP_FILE_DIR):
                file_path = os.path.join(TEMP_FILE_DIR, filename)
                if os.path.isfile(file_path):
                    try:
                        os.remove(file_path)
                        logging.info(f"Cleaned up old temporary file: {file_path}")
                    except Exception as e:
                        logging.error(f"Error cleaning up file {file_path}: {e}")
            cleanup_old_files.last_cleanup_time = time.time()
        else:
            logging.warning(f"Temporary directory '{TEMP_FILE_DIR}' not found during cleanup attempt. Skipping cleanup.")

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)