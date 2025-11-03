from flask import Flask, request, render_template, jsonify, send_from_directory
import os, sqlite3
from datetime import datetime
import requests

app = Flask(__name__)

# --------------------
# Upload folders
# --------------------
UPLOAD_FOLDER = os.path.join(os.getcwd(), 'uploads')
PHOTO_FOLDER = os.path.join(UPLOAD_FOLDER, 'Photo')
VOICE_FOLDER = os.path.join(UPLOAD_FOLDER, 'Voice')
os.makedirs(PHOTO_FOLDER, exist_ok=True)
os.makedirs(VOICE_FOLDER, exist_ok=True)

DB_PATH = os.path.join(os.getcwd(), 'complaints.db')

# --------------------
# Reverse Geocoding (using OpenStreetMap Nominatim)
# --------------------
def reverse_geocode(lat, lon):
    try:
        url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json"
        response = requests.get(url, headers={'User-Agent': 'SIH-Project'})
        if response.status_code == 200:
            data = response.json()
            return data.get("display_name", "Unknown Location")
    except:
        return "Unknown Location"

# --------------------
# Auto-Priority Calculation
# --------------------
def calculate_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two points in meters using Haversine formula"""
    from math import radians, cos, sin, asin, sqrt
    
    # Convert decimal degrees to radians
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    
    # Haversine formula
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * asin(sqrt(a))
    
    # Radius of earth in meters
    r = 6371000
    return c * r

def calculate_auto_priority(current_complaint, all_complaints):
    """Calculate auto-priority based on nearby complaints within 200-300 meters"""
    if not current_complaint.get('latitude') or not current_complaint.get('longitude'):
        return 'Low'
    
    current_lat = float(current_complaint['latitude'])
    current_lon = float(current_complaint['longitude'])
    
    nearby_count = 0
    
    for complaint in all_complaints:
        if (complaint['id'] != current_complaint['id'] and 
            complaint.get('latitude') and complaint.get('longitude')):
            
            distance = calculate_distance(
                current_lat, current_lon,
                float(complaint['latitude']), float(complaint['longitude'])
            )
            
            # Count complaints within 250 meters (average of 200-300m range)
            if distance <= 250:
                nearby_count += 1
    
    # Priority thresholds
    if nearby_count >= 5:
        return 'High'
    elif nearby_count >= 2:
        return 'Medium'
    else:
        return 'Low'

# --------------------
# DB Init
# --------------------
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS complaints (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT,
                    description TEXT,
                    photo TEXT,
                    voice TEXT,
                    latitude REAL,
                    longitude REAL,
                    address TEXT,
                    status TEXT DEFAULT 'Pending',
                    category TEXT DEFAULT 'Other',
                    priority TEXT DEFAULT 'Medium',
                    rating INTEGER DEFAULT NULL,
                    feedback TEXT DEFAULT NULL,
                    created_at TEXT
                )''')
    
    # Add new columns if they don't exist (for existing databases)
    try:
        c.execute("ALTER TABLE complaints ADD COLUMN category TEXT DEFAULT 'Other'")
    except:
        pass
    try:
        c.execute("ALTER TABLE complaints ADD COLUMN priority TEXT DEFAULT 'Medium'")
    except:
        pass
    try:
        c.execute("ALTER TABLE complaints ADD COLUMN rating INTEGER DEFAULT NULL")
    except:
        pass
    try:
        c.execute("ALTER TABLE complaints ADD COLUMN feedback TEXT DEFAULT NULL")
    except:
        pass
    
    conn.commit()
    conn.close()

init_db()

# --------------------
# Routes
# --------------------

@app.route('/')
def home():
    return '''
    <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
        <h1>🚀 Sahaayak - Civic Issue Reporting System</h1>
        <div style="display: flex; gap: 20px; justify-content: center; margin-top: 30px; flex-wrap: wrap;">
            <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; border: 2px solid #007bff;">
                <h3>👤 Citizens</h3>
                <p><a href="/submit" style="color: #007bff; text-decoration: none; font-weight: bold;">Submit Complaint</a></p>
                <p><a href="/my-complaints" style="color: #007bff; text-decoration: none; font-weight: bold;">My Complaints</a></p>
            </div>
            <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; border: 2px solid #28a745;">
                <h3>🏛️ Authority</h3>
                <p><a href="/dashboard" style="color: #28a745; text-decoration: none; font-weight: bold;">Dashboard</a></p>
            </div>
        </div>
        <p style="margin-top: 30px; color: #6c757d;">System is running and ready to serve!</p>
    </div>
    '''

# Citizen Submit Form
@app.route('/submit', methods=['GET', 'POST'])
def submit_complaint():
    if request.method == 'POST':
        citizen_name = request.form.get('citizen_name')
        description = request.form.get('description')
        category = request.form.get('category', 'Other')
        latitude = request.form.get('latitude')
        longitude = request.form.get('longitude')
        address = reverse_geocode(latitude, longitude)

        # Save photo
        photo_file = request.files.get('photo')
        photo_path = None
        if photo_file:
            photo_filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{photo_file.filename}"
            photo_path = os.path.join(PHOTO_FOLDER, photo_filename)
            photo_file.save(photo_path)

        # Save voice (optional) - handle both 'voice' and 'voice_note'
        voice_file = request.files.get('voice') or request.files.get('voice_note')
        voice_path = None
        if voice_file:
            voice_filename = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_voice_recording.webm"
            voice_path = os.path.join(VOICE_FOLDER, voice_filename)
            voice_file.save(voice_path)

        # Insert into DB
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''INSERT INTO complaints 
                     (name, description, category, photo, voice, latitude, longitude, address, created_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                  (citizen_name, description, category, photo_path, voice_path, latitude, longitude, address,
                   datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
        conn.commit()
        conn.close()

        return f"<h3>✅ Complaint submitted successfully!<br>Location: {address}</h3><a href='/submit'>Submit Another</a>"

    return render_template('submit.html')

# Authority Dashboard
@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

# My Complaints Page
@app.route('/my-complaints')
def my_complaints():
    return render_template('my_complaints.html')

# API for Authority Dashboard
@app.route('/api/complaints')
def get_complaints():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    
    # Get query parameters for filtering
    status_filter = request.args.get('status')
    category_filter = request.args.get('category')
    date_filter = request.args.get('date')
    priority_filter = request.args.get('priority')
    
    # Build query with filters
    query = "SELECT * FROM complaints WHERE 1=1"
    params = []
    
    if status_filter:
        query += " AND status = ?"
        params.append(status_filter)
    
    if category_filter:
        query += " AND category = ?"
        params.append(category_filter)
    
    if date_filter:
        query += " AND DATE(created_at) = ?"
        params.append(date_filter)
    
    query += " ORDER BY id DESC"
    
    c.execute(query, params)
    rows = c.fetchall()
    conn.close()
    complaints = [dict(row) for row in rows]

    # Calculate auto-priority for each complaint
    for complaint in complaints:
        complaint['auto_priority'] = calculate_auto_priority(complaint, complaints)
        
        # Convert file paths to URLs
        if complaint["photo"]:
            complaint["photo"] = "/uploads/photo/" + os.path.basename(complaint["photo"])
        if complaint["voice"]:
            complaint["voice"] = "/uploads/voice/" + os.path.basename(complaint["voice"])

    # Filter by auto-priority if specified
    if priority_filter:
        complaints = [c for c in complaints if c['auto_priority'] == priority_filter]

    return jsonify(complaints)

# API for My Complaints (filtered by citizen name)
@app.route('/api/my-complaints')
def get_my_complaints():
    citizen_name = request.args.get('name')
    if not citizen_name:
        return jsonify([])
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    
    # Get query parameters for filtering
    status_filter = request.args.get('status')
    sort_by = request.args.get('sort', 'newest')  # newest or oldest
    
    # Build query with filters
    query = "SELECT * FROM complaints WHERE name = ?"
    params = [citizen_name]
    
    if status_filter:
        query += " AND status = ?"
        params.append(status_filter)
    
    # Add sorting
    if sort_by == 'oldest':
        query += " ORDER BY id ASC"
    else:
        query += " ORDER BY id DESC"
    
    c.execute(query, params)
    rows = c.fetchall()
    conn.close()
    complaints = [dict(row) for row in rows]

    # Convert file paths to URLs
    for c in complaints:
        if c["photo"]:
            c["photo"] = "/uploads/photo/" + os.path.basename(c["photo"])
        if c["voice"]:
            c["voice"] = "/uploads/voice/" + os.path.basename(c["voice"])

    return jsonify(complaints)

# API to update complaint status
@app.route('/api/complaints/<int:complaint_id>/status', methods=['PUT'])
def update_complaint_status(complaint_id):
    data = request.get_json()
    new_status = data.get('status')
    
    if not new_status:
        return jsonify({'error': 'Status is required'}), 400
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("UPDATE complaints SET status = ? WHERE id = ?", (new_status, complaint_id))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})

# API to submit feedback/rating
@app.route('/api/complaints/<int:complaint_id>/feedback', methods=['POST'])
def submit_feedback(complaint_id):
    data = request.get_json()
    rating = data.get('rating')
    feedback = data.get('feedback', '')
    
    if not rating or rating < 1 or rating > 5:
        return jsonify({'error': 'Rating must be between 1 and 5'}), 400
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("UPDATE complaints SET rating = ?, feedback = ? WHERE id = ?", 
              (rating, feedback, complaint_id))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})

# API to update complaint priority
@app.route('/api/update-priority/<int:complaint_id>', methods=['PUT'])
def update_priority(complaint_id):
    data = request.get_json()
    priority = data.get('priority')
    
    if not priority or priority not in ['Low', 'Medium', 'High']:
        return jsonify({'error': 'Priority must be Low, Medium, or High'}), 400
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("UPDATE complaints SET priority = ? WHERE id = ?", (priority, complaint_id))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})

# Serve uploaded photos
@app.route('/uploads/photo/<filename>')
def uploaded_photo(filename):
    return send_from_directory(PHOTO_FOLDER, filename)

# Serve uploaded voices
@app.route('/uploads/voice/<filename>')
def uploaded_voice(filename):
    return send_from_directory(VOICE_FOLDER, filename)

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000, debug=True)