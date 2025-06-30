const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://pratikkumarjhavnit:1E2iWG3D2USTQBNP@cluster0.z2g7mrv.mongodb.net/mica-assessment?retryWrites=true&w=majority&appName=Cluster0';

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Student Result Schema
const studentResultSchema = new mongoose.Schema({
  rollNo: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  score: {
    type: Number,
    required: true
  },
  grade: {
    type: String,
    required: true
  },
  percentage: {
    type: Number,
    required: false
  },
  answers: {
    type: Array,
    required: true
  },
  timeSpent: {
    type: Number,
    required: true
  },
  submittedAt: {
    type: Date,
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const StudentResult = mongoose.model('StudentResult', studentResultSchema);

app.get('/',(req,res)=>{
    res.send("The backend for test is running")
})
// API Endpoint to store test results
app.post('/api/results', async (req, res) => {
  try {
    const { student, answers, timeSpent, submittedAt, analysis } = req.body;
    
    if (!student || !student.rollNo || !analysis) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if student already exists
    const existingResult = await StudentResult.findOne({ rollNo: student.rollNo });
    
    if (existingResult) {
      return res.status(200).json({ 
        success: false,
        message: 'Score not updated - only first assessment is recorded'
      });
    }
    
    // Create new student result
    const newResult = new StudentResult({
      rollNo: student.rollNo,
      name: student.name,
      score: analysis.correctCount,
      grade: analysis.grade,
      percentage: analysis.percentage,
      answers: answers,
      timeSpent: timeSpent,
      submittedAt: submittedAt
    });

    await newResult.save();
    
    res.json({ 
      success: true, 
      message: 'Score recorded successfully',
      result: newResult
    });
  } catch (error) {
    console.error('Error saving results:', error);
    res.status(500).json({ error: 'Failed to save results' });
  }
});

// API Endpoint to check if student has taken test before
app.get('/api/results/:rollNo', async (req, res) => {
  try {
    const { rollNo } = req.params;
    
    const existingResult = await StudentResult.findOne({ rollNo });
    
    if (existingResult) {
      res.json({ 
        hasTakenTest: true, 
        student: {
          rollNo: existingResult.rollNo,
          name: existingResult.name,
          score: existingResult.score,
          grade: existingResult.grade,
          percentage: existingResult.percentage,
          submittedAt: existingResult.submittedAt
        }
      });
    } else {
      res.json({ hasTakenTest: false });
    }
  } catch (error) {
    console.error('Error checking student results:', error);
    res.status(500).json({ error: 'Failed to check student results' });
  }
});

// API Endpoint to get all results (for admin purposes)
app.get('/api/results', async (req, res) => {
  try {
    const results = await StudentResult.find().sort({ createdAt: -1 });
    res.json(results);
  } catch (error) {
    console.error('Error fetching results:', error);
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    dbStatus: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    timestamp: new Date()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle shutdown gracefully
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed');
  process.exit(0);
});