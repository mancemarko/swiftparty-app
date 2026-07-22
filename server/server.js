require('dotenv').config();
const express = require('express');
const path = require('path');

const connectDB = require('./config/db');
const partyRoutes = require('./routes/party.routes');
const spotifyRoutes = require('./routes/spotify.routes');

const app = express();
app.use(express.json());

app.use(express.static(path.join(__dirname, '../client/public')));

connectDB();

app.use('/api/parties', partyRoutes);
app.use('/api/spotify', spotifyRoutes);

// Shareable party link — party.html reads the code from the URL path client-side.
app.get('/p/:code', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/party.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/index.html'));
});

const PORT = process.env.PORT || 5500;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
