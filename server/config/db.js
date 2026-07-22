const mongoose = require('mongoose');

async function connectDB() {
  const mongoURI = process.env.mongo_URI || 'mongodb://localhost:27017/swiftpartyapp';
  try {
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB connected');
  } catch (err) {
    console.error('❌ MongoDB connection error: ', err);
  }
}

module.exports = connectDB;
