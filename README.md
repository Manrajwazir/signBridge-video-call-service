# ASL Hand Sign Recognition App

A real-time **American Sign Language (ASL) hand sign detection** app built with **React**, **TensorFlow.js**, and **MediaPipe Hands**. It uses your webcam feed to detect your hand, extract 21 key hand landmarks, and classify them into ASL hand signs.

---

## 🚀 Features

* Real-time webcam-based hand tracking
* Detects 21 hand landmarks using **MediaPipe Hands**
* Classifies gestures using a **TensorFlow.js ML model**
* Clean UI with canvas overlay
* Lightweight and fast

---

## 📦 Tech Stack

* **React (Vite)** – Frontend framework
* **TensorFlow.js** – Machine learning model for hand sign classification
* **MediaPipe Hands** – Hand tracking and landmark detection
* **JavaScript** / **ES Modules** – Core logic

---

## 🧑‍💻 How It Works (Short Explanation)

1. MediaPipe scans your webcam feed and finds your hand.
2. It extracts **21 landmark points** (x, y, z).
3. These points are passed into a TensorFlow.js model.
4. The model predicts which gesture/letter you are showing.
5. UI displays the result.

---

## 📁 Project Structure

```
project-folder/
│
├── public/
│   ├── model/            # TFJS model (model.json + weights)
│   ├── index.html
│
├── src/
│   ├── App.jsx           # Main component
│   ├── components/       # UI components
│   ├── utils/            # Hand logic, helpers
│   ├── assets/           # Images/icons
│   └── main.jsx
│
├── .gitignore
├── package.json
└── README.md
```

---

## ▶️ How to Run the Project

Follow these steps to run the ASL Recognition app locally.

### **1. Install Node.js**

You need Node **v18+**.
Download from:
[https://nodejs.org](https://nodejs.org)

Check version:

```
node -v
npm -v
```

---

### **2. Install Dependencies**

Open your project folder and run:

```
npm install
```

---

### **3. Start Development Server**

```
npm run dev
```

Then open the link shown in terminal, usually:

```
http://localhost:5173
```

---

## 🎥 Webcam Permissions

When the app starts, your browser will ask for webcam permission.
Click **Allow**.

If webcam doesn't start:

* Ensure no other app is using it
* Refresh the page
* Restart browser

---

## 🧠 Model Information

The model is stored in:

```
/public/model/
```

This includes:

* `model.json`
* `group1-shard1.bin` (and others)

This model receives 21 hand landmark coordinates and predicts the sign.

---

## ❗ Troubleshooting

### **❌ Error: Cannot read properties of undefined (reading 'load')**

This means the ML model failed to load.
Fix:

* Ensure folder name is exactly: `public/model/`
* Ensure `model.json` exists
* Paths must match:

```
await tf.loadGraphModel('/model/model.json')
```

---

### **❌ AbortError: play() request interrupted by load()**

Happens when video restarts too fast.
Fix:

* Only call `video.play()` once
* Wrap video initialization in `useEffect` with proper cleanup

---

## 📝 .gitignore (included automatically)

```
# dependencies
/node_modules

# build output
/dist

# logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# environment
.env
.env.*

# OS files
.DS_Store
Thumbs.db
```

---

## 📌 Future Improvements

* Add more ASL letters
* Improve prediction accuracy
* Add sound/text-to-speech
* Add support for two-hand gestures
* Add custom model training UI

---

## 📄 License

This project is for **personal and educational** use.

---

## 🙌 Credits

* Google MediaPipe Hands
* TensorFlow.js Team
* React & Vite

---

If you want, I can:

* Polish the README more
* Add screenshots & gifs
* Create documentation for your functions
* Add installation commands for Windows/Mac/Linux
