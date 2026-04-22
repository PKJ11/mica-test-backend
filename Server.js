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

// ─── Schemas ────────────────────────────────────────────────────────────────

const testCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true },
  description: { type: String, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const TestCategory = mongoose.model('TestCategory', testCategorySchema);

const questionSchema = new mongoose.Schema({
  testCategory: { type: mongoose.Schema.Types.ObjectId, ref: "TestCategory", required: true },
  testType: { type: String, enum: ["sample", "live"], default: "sample", required: true },
  grade: {
    type: String,
    required: true,
    enum: ["Grade4","Grade5","Grade6","Grade7","Grade8","Grade9","Grade10","default"],
  },
  type: {
    type: String,
    required: true,
    // ── CHANGE 1: Added "text" and "numeric" to question types ──────────────
    enum: ["multiple-choice", "short-answer", "drag-and-drop", "match-pairs", "text", "numeric"],
  },
  question: { type: String, required: true },
  image: { type: String },
  marks: { type: Number, default: 1, min: 0 },
  options: {
    type: [mongoose.Schema.Types.Mixed],
    required: function () { return this.type === "multiple-choice"; },
  },
  items: {
    type: [String],
    required: function () { return this.type === "drag-and-drop"; },
  },
  correctOrder: {
    type: [String],
    required: function () { return this.type === "drag-and-drop"; },
  },
  correctAnswer: mongoose.Schema.Types.Mixed,
  pairs: [{ id: String, left: String, right: String }],
  difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
  tags: [String],
  // ── CHANGE 2: groups array field — references Group documents by ObjectId ──
  groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }],
  // ──────────────────────────────────────────────────────────────────────────
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const Question = mongoose.model("Question", questionSchema);

// ── CHANGE 3: Group Schema ────────────────────────────────────────────────────
const groupSchema = new mongoose.Schema({
  groupId: { type: String, required: true, unique: true, trim: true },
  questions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
  testCategory: { type: mongoose.Schema.Types.ObjectId, ref: "TestCategory", required: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Group = mongoose.model('Group', groupSchema);
// ─────────────────────────────────────────────────────────────────────────────

const studentResultSchema = new mongoose.Schema({
  testCategory: { type: mongoose.Schema.Types.ObjectId, ref: "TestCategory", required: true },
  rollNo: { type: String, required: true },
  name: { type: String, required: true },
  score: { type: Number, required: true },
  totalMarks: { type: Number, required: false },
  grade: { type: String, required: true },
  percentage: { type: Number, required: false },
  answers: { type: Array, required: true },
  timeSpent: { type: Number, required: true },
  submittedAt: { type: Date, required: false },
  createdAt: { type: Date, default: Date.now }
});

const StudentResult = mongoose.model('StudentResult', studentResultSchema);

const testTimerSchema = new mongoose.Schema({
  testCategory: { type: mongoose.Schema.Types.ObjectId, ref: "TestCategory", required: true, unique: true },
  sampleTestDuration: { type: Number, required: true },
  liveTestDuration: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const TestTimer = mongoose.model('TestTimer', testTimerSchema);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateSlug = (name) =>
  slugify(name, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });

// ─── Test Category Routes ─────────────────────────────────────────────────────

app.post('/api/test-categories', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const slug = generateSlug(name);
    const existing = await TestCategory.findOne({ $or: [{ name }, { slug }] });
    if (existing) return res.status(400).json({ error: 'Test category already exists' });

    const newCategory = new TestCategory({ name, slug, description });
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
    if (!category) return res.status(404).json({ error: 'Test category not found' });
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Test Timer Routes ────────────────────────────────────────────────────────

app.post('/api/test-timer', async (req, res) => {
  try {
    const { testCategory, sampleTestDuration, liveTestDuration } = req.body;
    if (!testCategory || sampleTestDuration === undefined || liveTestDuration === undefined)
      return res.status(400).json({ error: 'Missing required fields (testCategory, sampleTestDuration, liveTestDuration)' });

    let category = await TestCategory.findOne({ slug: testCategory });
    if (!category && mongoose.Types.ObjectId.isValid(testCategory))
      category = await TestCategory.findById(testCategory);
    if (!category) return res.status(400).json({ error: 'Test category not found' });

    if (sampleTestDuration <= 0 || liveTestDuration <= 0)
      return res.status(400).json({ error: 'Duration must be greater than 0 minutes' });

    let timer = await TestTimer.findOne({ testCategory: category._id });
    if (timer) {
      timer.sampleTestDuration = sampleTestDuration;
      timer.liveTestDuration = liveTestDuration;
      timer.updatedAt = new Date();
      await timer.save();
    } else {
      timer = new TestTimer({ testCategory: category._id, sampleTestDuration, liveTestDuration });
      await timer.save();
    }

    res.status(201).json({
      success: true,
      message: 'Timer configuration saved successfully',
      data: {
        testCategory: category.name,
        testCategorySlug: category.slug,
        sampleTestDuration: timer.sampleTestDuration,
        liveTestDuration: timer.liveTestDuration,
        updatedAt: timer.updatedAt
      }
    });
  } catch (error) {
    console.error('Error saving timer:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/test-timer/:testCategory', async (req, res) => {
  try {
    const { testCategory } = req.params;
    let category = await TestCategory.findOne({ slug: testCategory });
    if (!category && mongoose.Types.ObjectId.isValid(testCategory))
      category = await TestCategory.findById(testCategory);
    if (!category) return res.status(404).json({ error: 'Test category not found' });

    const timer = await TestTimer.findOne({ testCategory: category._id });
    if (!timer) {
      return res.json({
        testCategory: category.name,
        testCategorySlug: category.slug,
        sampleTestDuration: 30,
        liveTestDuration: 60,
        isDefault: true,
        message: 'Using default timer settings'
      });
    }

    res.json({
      testCategory: category.name,
      testCategorySlug: category.slug,
      sampleTestDuration: timer.sampleTestDuration,
      liveTestDuration: timer.liveTestDuration,
      updatedAt: timer.updatedAt,
      isDefault: false
    });
  } catch (error) {
    console.error('Error fetching timer:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/test-timers', async (req, res) => {
  try {
    const timers = await TestTimer.find().populate('testCategory', 'name slug').sort({ createdAt: -1 });
    const formattedTimers = timers.map(t => ({
      testCategory: t.testCategory.name,
      testCategorySlug: t.testCategory.slug,
      sampleTestDuration: t.sampleTestDuration,
      liveTestDuration: t.liveTestDuration,
      updatedAt: t.updatedAt
    }));
    res.json(formattedTimers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Question Routes ──────────────────────────────────────────────────────────

app.get("/api/questions", async (req, res) => {
  try {
    const { grade, testType, type, difficulty, testCategory } = req.query;
    const query = {};

    if (testCategory) {
      const category = await TestCategory.findOne({ slug: testCategory });
      if (!category) return res.status(400).json({ error: "Test category not found" });
      query.testCategory = category._id;
    }

    if (grade) query.grade = grade;
    if (testType) query.testType = testType;
    if (type) query.type = type;
    if (difficulty) query.difficulty = difficulty;

    const questions = await Question.find(query)
      .populate('testCategory')
      .populate('groups')
      .sort({ grade: 1, createdAt: -1 });
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/questions", async (req, res) => {
  try {
    const {
      grade, type, question, testType = "sample", testCategory,
      image = "", marks = 1, groups = []
    } = req.body;

    if (!grade || !type || !question || !testCategory)
      return res.status(400).json({ error: "Missing required fields (grade, type, question, testCategory)" });

    const category = await TestCategory.findOne({ slug: testCategory });
    if (!category) return res.status(400).json({ error: "Test category not found" });

    let validationError;
    switch (type) {
      case "multiple-choice":
        if (!req.body.options || !req.body.correctAnswer)
          validationError = "Multiple-choice questions require options and correctAnswer";
        break;
      case "short-answer":
        if (!req.body.correctAnswer)
          validationError = "Short-answer questions require correctAnswer";
        break;
      case "drag-and-drop":
        if (!req.body.items || !req.body.correctOrder)
          validationError = "Drag-and-drop questions require items and correctOrder";
        break;
      case "match-pairs":
        if (!req.body.pairs)
          validationError = "Match-pairs questions require pairs";
        break;
      case "text":
        // Optional: correctAnswer can be provided as a model answer
        break;
      case "numeric":
        if (req.body.correctAnswer === undefined || req.body.correctAnswer === null)
          validationError = "Numeric questions require a correctAnswer (number)";
        break;
    }
    if (validationError) return res.status(400).json({ error: validationError });

    // Validate group IDs if provided
    if (groups.length > 0) {
      const validGroups = await Group.find({ _id: { $in: groups } }).select('_id');
      if (validGroups.length !== groups.length)
        return res.status(400).json({ error: "One or more group IDs are invalid" });
    }

    const questionData = {
      testCategory: category._id,
      grade,
      type,
      question,
      testType,
      image,
      marks: Number(marks) >= 0 ? Number(marks) : 1,
      difficulty: req.body.difficulty || "medium",
      tags: req.body.tags || [],
      groups,
      ...(type === "multiple-choice" && { options: req.body.options, correctAnswer: req.body.correctAnswer }),
      ...(type === "short-answer" && { correctAnswer: req.body.correctAnswer }),
      ...(type === "drag-and-drop" && { items: req.body.items, correctOrder: req.body.correctOrder }),
      ...(type === "match-pairs" && { pairs: req.body.pairs }),
      ...(type === "text" && req.body.correctAnswer !== undefined && { correctAnswer: req.body.correctAnswer }),
      ...(type === "numeric" && { correctAnswer: Number(req.body.correctAnswer) }),
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

    if (testCategory) {
      const category = await TestCategory.findOne({ slug: testCategory });
      if (category) {
        match.testCategory = category._id;
      } else {
        return res.json({ totalQuestions: 0, sampleQuestions: 0, liveQuestions: 0, gradeLevels: 0, questionTypes: 0, difficultyLevels: 0 });
      }
    }

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
          difficulties: { $addToSet: "$difficulty" },
          totalMarks: { $sum: { $ifNull: ["$marks", 1] } }
        }
      }
    ]);

    const result = counts[0] || { total: 0, sample: 0, live: 0, grades: [], types: [], difficulties: [], totalMarks: 0 };

    res.json({
      totalQuestions: result.total,
      sampleQuestions: result.sample,
      liveQuestions: result.live,
      gradeLevels: result.grades.length,
      questionTypes: result.types.length,
      difficultyLevels: result.difficulties.length,
      totalMarks: result.totalMarks
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/questions/:id", async (req, res) => {
  try {
    const question = await Question.findById(req.params.id)
      .populate('testCategory')
      .populate('groups');
    if (!question) return res.status(404).json({ error: "Question not found" });
    res.json(question);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/questions/:id", async (req, res) => {
  try {
    const { testCategory, marks, groups, ...updateData } = req.body;

    if (testCategory && !mongoose.Types.ObjectId.isValid(testCategory)) {
      const category = await TestCategory.findOne({ $or: [{ slug: testCategory }, { name: testCategory }] });
      if (!category) return res.status(400).json({ error: "Test category not found" });
      updateData.testCategory = category._id;
    } else if (testCategory) {
      updateData.testCategory = testCategory;
    }

    if (marks !== undefined) {
      updateData.marks = Number(marks) >= 0 ? Number(marks) : 1;
    }

    if (groups !== undefined) {
      if (groups.length > 0) {
        const validGroups = await Group.find({ _id: { $in: groups } }).select('_id');
        if (validGroups.length !== groups.length)
          return res.status(400).json({ error: "One or more group IDs are invalid" });
      }
      updateData.groups = groups;
    }

    updateData.updatedAt = new Date();

    const updatedQuestion = await Question.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('testCategory').populate('groups');

    if (!updatedQuestion) return res.status(404).json({ error: "Question not found" });
    res.json(updatedQuestion);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/questions/:id", async (req, res) => {
  try {
    const deletedQuestion = await Question.findByIdAndDelete(req.params.id);
    if (!deletedQuestion) return res.status(404).json({ error: "Question not found" });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Group Routes ─────────────────────────────────────────────────────────────

// Create a new group
app.post('/api/groups', async (req, res) => {
  try {
    const { groupId, questions = [], testCategory } = req.body;
    if (!groupId) return res.status(400).json({ error: 'groupId is required' });

    const existing = await Group.findOne({ groupId });
    if (existing) return res.status(400).json({ error: 'Group with this groupId already exists' });

    let categoryId;
    if (testCategory) {
      const category = await TestCategory.findOne({ slug: testCategory });
      if (!category) return res.status(400).json({ error: 'Test category not found' });
      categoryId = category._id;
    }

    // Validate question IDs if provided
    if (questions.length > 0) {
      const validQuestions = await Question.find({ _id: { $in: questions } }).select('_id');
      if (validQuestions.length !== questions.length)
        return res.status(400).json({ error: 'One or more question IDs are invalid' });
    }

    const newGroup = new Group({ groupId, questions, testCategory: categoryId });
    await newGroup.save();
    res.status(201).json(newGroup);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all groups (optionally filter by testCategory)
app.get('/api/groups', async (req, res) => {
  try {
    const { testCategory } = req.query;
    const query = {};

    if (testCategory) {
      const category = await TestCategory.findOne({ slug: testCategory });
      if (!category) return res.status(400).json({ error: 'Test category not found' });
      query.testCategory = category._id;
    }

    const groups = await Group.find(query)
      .populate('questions')
      .populate('testCategory', 'name slug')
      .sort({ createdAt: -1 });
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a single group by groupId
app.get('/api/groups/:groupId', async (req, res) => {
  try {
    const group = await Group.findOne({ groupId: req.params.groupId })
      .populate('questions')
      .populate('testCategory', 'name slug');
    if (!group) return res.status(404).json({ error: 'Group not found' });
    res.json(group);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a group (add/remove questions, rename groupId)
app.put('/api/groups/:groupId', async (req, res) => {
  try {
    const { questions, testCategory, ...updateData } = req.body;

    if (questions !== undefined) {
      if (questions.length > 0) {
        const validQuestions = await Question.find({ _id: { $in: questions } }).select('_id');
        if (validQuestions.length !== questions.length)
          return res.status(400).json({ error: 'One or more question IDs are invalid' });
      }
      updateData.questions = questions;
    }

    if (testCategory !== undefined) {
      const category = await TestCategory.findOne({ slug: testCategory });
      if (!category) return res.status(400).json({ error: 'Test category not found' });
      updateData.testCategory = category._id;
    }

    updateData.updatedAt = new Date();

    const updatedGroup = await Group.findOneAndUpdate(
      { groupId: req.params.groupId },
      updateData,
      { new: true, runValidators: true }
    ).populate('questions').populate('testCategory', 'name slug');

    if (!updatedGroup) return res.status(404).json({ error: 'Group not found' });
    res.json(updatedGroup);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a group
app.delete('/api/groups/:groupId', async (req, res) => {
  try {
    const deletedGroup = await Group.findOneAndDelete({ groupId: req.params.groupId });
    if (!deletedGroup) return res.status(404).json({ error: 'Group not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Test Endpoints ───────────────────────────────────────────────────────────

app.get("/api/sample-test/:grade", async (req, res) => {
  try {
    const { grade } = req.params;
    const { testCategory } = req.query;
    const query = { grade, testType: "sample" };
    if (testCategory) query.testCategory = testCategory;

    let questions = await Question.find(query).limit(10);
    if (questions.length === 0) {
      questions = await Question.find({ grade: "default", testType: "sample", ...(testCategory && { testCategory }) }).limit(10);
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
      questions = await Question.find({ grade: "default", testType: "live", ...(testCategory && { testCategory }) }).limit(20);
    }
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Results Endpoints ────────────────────────────────────────────────────────

app.post('/api/results', async (req, res) => {
  try {
    const { student, answers, timeSpent, submittedAt, analysis, testCategory } = req.body;

    if (!student || !student.rollNo || !analysis || !testCategory)
      return res.status(400).json({ error: 'Missing required fields' });

    const category = await TestCategory.findOne({ slug: testCategory });
    if (!category) return res.status(400).json({ error: 'Test category not found' });

    const existingResult = await StudentResult.findOne({ rollNo: student.rollNo, testCategory: category._id });
    if (existingResult) {
      return res.status(200).json({ success: false, message: 'Score not updated - only first assessment is recorded' });
    }

    const newResult = new StudentResult({
      testCategory: category._id,
      rollNo: student.rollNo,
      name: student.name,
      score: analysis.marksEarned ?? analysis.correctCount,
      totalMarks: analysis.totalMarks ?? analysis.totalQuestions,
      grade: analysis.grade,
      percentage: analysis.percentage,
      answers,
      timeSpent,
      submittedAt
    });

    await newResult.save();
    res.json({ success: true, message: 'Score recorded successfully', result: newResult });
  } catch (error) {
    console.error('Error saving results:', error);
    res.status(500).json({ error: 'Failed to save results: ' + error.message });
  }
});

app.get('/api/results/:rollNo/:testCategory', async (req, res) => {
  try {
    const { rollNo, testCategory } = req.params;
    if (!testCategory) return res.status(400).json({ error: 'Test category is required' });

    const category = await TestCategory.findOne({ slug: testCategory });
    if (!category) return res.status(404).json({ error: 'Test category not found' });

    const existingResult = await StudentResult.findOne({ rollNo, testCategory: category._id });
    if (existingResult) {
      res.json({
        hasTakenTest: true,
        student: {
          rollNo: existingResult.rollNo,
          name: existingResult.name,
          score: existingResult.score,
          totalMarks: existingResult.totalMarks,
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
    let query = {};

    if (testCategory) {
      let category = null;
      if (mongoose.Types.ObjectId.isValid(testCategory))
        category = await TestCategory.findById(testCategory);
      if (!category)
        category = await TestCategory.findOne({ slug: testCategory });
      if (category) {
        query.testCategory = category._id;
      } else {
        return res.json([]);
      }
    }

    const results = await StudentResult.find(query)
      .populate('testCategory', 'name slug')
      .sort({ createdAt: -1 })
      .lean();

    res.json(results);
  } catch (error) {
    console.error('Error fetching results:', error);
    res.status(500).json({
      error: 'Failed to fetch results',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    dbStatus: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    timestamp: new Date()
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});