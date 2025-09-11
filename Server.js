const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const slugify = require('slugify');

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

// Test Category Schema
const testCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  description: {
    type: String,
    default: ""
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

const TestCategory = mongoose.model('TestCategory', testCategorySchema);

// Question Schema
const questionSchema = new mongoose.Schema({
  testCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TestCategory",
    required: true
  },
  testType: {
    type: String,
    enum: ["sample", "live"],
    default: "sample",
    required: true,
  },
  grade: {
    type: String,
    required: true,
    enum: [
      "Grade4",
      "Grade5",
      "Grade6",
      "Grade7",
      "Grade8",
      "Grade9",
      "Grade10",
      "default",
    ],
  },
  type: {
    type: String,
    required: true,
    enum: ["multiple-choice", "short-answer", "drag-and-drop", "match-pairs"],
  },
  question: {
    type: String,
    required: true,
  },
  image: {
    type: String,
  },
  options: {
    type: [mongoose.Schema.Types.Mixed],
    required: function () {
      return this.type === "multiple-choice" || this.type === "drag-and-drop";
    },
  },
  items: {
    type: [String],
    required: function () {
      return this.type === "drag-and-drop";
    },
  },
  correctOrder: {
    type: [String],
    required: function () {
      return this.type === "drag-and-drop";
    },
  },
  correctAnswer: mongoose.Schema.Types.Mixed,
  pairs: [
    {
      id: String,
      left: String,
      right: String,
    },
  ],
  difficulty: {
    type: String,
    enum: ["easy", "medium", "hard"],
    default: "medium",
  },
  tags: [String],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const Question = mongoose.model("Question", questionSchema);

// Student Result Schema
const studentResultSchema = new mongoose.Schema({
  testCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "TestCategory",
    required: true
  },
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

// Helper function to generate slug
const generateSlug = (name) => {
  return slugify(name, {
    lower: true,
    strict: true,
    remove: /[*+~.()'"!:@]/g
  });
};

// Test Category Routes
app.post('/api/test-categories', async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const slug = generateSlug(name);
    
    const existingCategory = await TestCategory.findOne({ 
      $or: [{ name }, { slug }] 
    });
    
    if (existingCategory) {
      return res.status(400).json({ error: 'Test category already exists' });
    }

    const newCategory = new TestCategory({
      name,
      slug,
      description
    });

    await newCategory.save();

    res.status(201).json(newCategory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/test-categories', async (req, res) => {
  try {
    const categories = await TestCategory.find().sort({ createdAt: -1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/test-categories/:slug', async (req, res) => {
  try {
    const category = await TestCategory.findOne({ slug: req.params.slug });
    if (!category) {
      return res.status(404).json({ error: 'Test category not found' });
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Question Routes
app.get("/api/questions", async (req, res) => {
  try {
    const { grade, testType, type, difficulty, testCategory } = req.query;
    const query = {};

    // Find category if testCategory is provided
    if (testCategory) {
      const category = await TestCategory.findOne({ slug: testCategory });
      if (!category) {
        return res.status(400).json({ error: "Test category not found" });
      }
      query.testCategory = category._id;
    }

    if (grade) query.grade = grade;
    if (testType) query.testType = testType;
    if (type) query.type = type;
    if (difficulty) query.difficulty = difficulty;

    const questions = await Question.find(query).populate('testCategory').sort({
      grade: 1,
      createdAt: -1,
    });

    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/questions", async (req, res) => {
  try {
    const { grade, type, question, testType = "sample", testCategory, image = "" } = req.body;

    if (!grade || !type || !question || !testCategory) {
      return res.status(400).json({
        error: "Missing required fields (grade, type, question, testCategory)"
      });
    }

    // First find the test category by its slug to get its ObjectId
    const category = await TestCategory.findOne({ slug: testCategory });
    if (!category) {
      return res.status(400).json({ error: "Test category not found" });
    }

    let validationError;
    switch (type) {
      case "multiple-choice":
        if (!req.body.options || !req.body.correctAnswer) {
          validationError = "Multiple-choice questions require options and correctAnswer";
        }
        break;
      case "short-answer":
        if (!req.body.correctAnswer) {
          validationError = "Short-answer questions require correctAnswer";
        }
        break;
      case "drag-and-drop":
        if (!req.body.items || !req.body.correctOrder) {
          validationError = "Drag-and-drop questions require items and correctOrder";
        }
        break;
      case "match-pairs":
        if (!req.body.pairs) {
          validationError = "Match-pairs questions require pairs";
        }
        break;
    }

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const questionData = {
      testCategory: category._id, // Use the ObjectId from the found category
      grade,
      type,
      question,
      testType,
      image,
      difficulty: req.body.difficulty || "medium",
      tags: req.body.tags || [],
      ...(type === "multiple-choice" && {
        options: req.body.options,
        correctAnswer: req.body.correctAnswer,
      }),
      ...(type === "short-answer" && {
        correctAnswer: req.body.correctAnswer,
      }),
      ...(type === "drag-and-drop" && {
        items: req.body.items,
        correctOrder: req.body.correctOrder,
      }),
      ...(type === "match-pairs" && {
        pairs: req.body.pairs,
      }),
    };

    const newQuestion = new Question(questionData);
    await newQuestion.save();

    res.status(201).json(newQuestion);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/questions/count", async (req, res) => {
  try {
    const { testCategory } = req.query;
    const match = {};

    if (testCategory) match.testCategory = testCategory;

    const counts = await Question.aggregate([
      { $match: match },
      { 
        $group: {
          _id: null,
          total: { $sum: 1 },
          sample: { $sum: { $cond: [{ $eq: ["$testType", "sample"] }, 1, 0] } },
          live: { $sum: { $cond: [{ $eq: ["$testType", "live"] }, 1, 0] } },
          grades: { $addToSet: "$grade" },
          types: { $addToSet: "$type" },
          difficulties: { $addToSet: "$difficulty" }
        }
      }
    ]);

    const result = counts[0] || {
      total: 0,
      sample: 0,
      live: 0,
      grades: [],
      types: [],
      difficulties: []
    };

    res.json({
      totalQuestions: result.total,
      sampleQuestions: result.sample,
      liveQuestions: result.live,
      gradeLevels: result.grades.length,
      questionTypes: result.types.length,
      difficultyLevels: result.difficulties.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/questions/:id", async (req, res) => {
  try {
    const question = await Question.findById(req.params.id).populate('testCategory');
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }
    res.json(question);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/questions/:id", async (req, res) => {
  try {
    const updatedQuestion = await Question.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('testCategory');

    if (!updatedQuestion) {
      return res.status(404).json({ error: "Question not found" });
    }

    res.json(updatedQuestion);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/questions/:id", async (req, res) => {
  try {
    const deletedQuestion = await Question.findByIdAndDelete(req.params.id);
    if (!deletedQuestion) {
      return res.status(404).json({ error: "Question not found" });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test Endpoints
app.get("/api/sample-test/:grade", async (req, res) => {
  try {
    const { grade } = req.params;
    const { testCategory } = req.query;
    
    const query = { grade, testType: "sample" };
    if (testCategory) query.testCategory = testCategory;

    let questions = await Question.find(query).limit(10);
    
    if (questions.length === 0) {
      questions = await Question.find({ 
        grade: "default", 
        testType: "sample",
        ...(testCategory && { testCategory })
      }).limit(10);
    }

    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/live-test/:grade", async (req, res) => {
  try {
    const { grade } = req.params;
    const { testCategory } = req.query;
    
    const query = { grade, testType: "live" };
    if (testCategory) query.testCategory = testCategory;

    let questions = await Question.find(query).limit(20);
    
    if (questions.length === 0) {
      questions = await Question.find({ 
        grade: "default", 
        testType: "live",
        ...(testCategory && { testCategory })
      }).limit(20);
    }

    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Results Endpoints
app.post('/api/results', async (req, res) => {
  try {
    const { student, answers, timeSpent, submittedAt, analysis, testCategory } = req.body;
    
    if (!student || !student.rollNo || !analysis || !testCategory) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existingResult = await StudentResult.findOne({ rollNo: student.rollNo });
    
    if (existingResult) {
      return res.status(200).json({ 
        success: false,
        message: 'Score not updated - only first assessment is recorded'
      });
    }
    
    const newResult = new StudentResult({
      testCategory,
      rollNo: student.rollNo,
      name: student.name,
      score: analysis.correctCount,
      grade: analysis.grade,
      percentage: analysis.percentage,
      answers,
      timeSpent,
      submittedAt
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

app.get('/api/results/:rollNo', async (req, res) => {
  try {
    const { rollNo } = req.params;
    const { testCategory } = req.query;
    
    const query = { rollNo };
    if (testCategory) query.testCategory = testCategory;

    const existingResult = await StudentResult.findOne(query);
    
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

app.get('/api/results', async (req, res) => {
  try {
    const { testCategory } = req.query;
    const query = {};
    if (testCategory) query.testCategory = testCategory;

    const results = await StudentResult.find(query).sort({ createdAt: -1 });
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