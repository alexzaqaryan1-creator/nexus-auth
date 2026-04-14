const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

// frontend folder
app.use(express.static(path.join(__dirname, 'public')));

// home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// test API
app.get('/api/test', (req, res) => {
  res.json({ message: "Server is working 🚀" });
});

// start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});