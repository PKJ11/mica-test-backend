const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const slugify = require('slugify');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://pratikkumarjhavnit:1E2iWG3D2USTQBNP@cluster0.z2g7mrv.mongodb.net/mica-assessment?retryWrites=true&w=majority&appName=Cluster0';

app.use(cors());
app.use(bodyParser.json());

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// ─── Schemas ──────────────────────────────────────────────────────────────────

const testCategorySchema = new mongoose.Schema({
  name:        { type: String, required: true, unique: true, trim: true },
  slug:        { type: String, required: true, unique: true, lowercase: true },
  description: { type: String, default: "" },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now }
});
const TestCategory = mongoose.model('TestCategory', testCategorySchema);

const questionSchema = new mongoose.Schema({
  testCategory: [{ type: mongoose.Schema.Types.ObjectId, ref: "TestCategory" }],
  questionName: { type: String, default: "", trim: true },
  type: {
    type: String,
    required: true,
    enum: ["multiple-choice","short-answer","drag-and-drop","match-pairs","text","numeric"],
  },
  question:     { type: String, required: true },
  image:        { type: String },
  defaultMarks: { type: Number, default: 1, min: 0 },
  options:      { type: [mongoose.Schema.Types.Mixed] },
  items:        { type: [String] },
  correctOrder: { type: [String] },
  correctAnswer: mongoose.Schema.Types.Mixed,
  pairs: [{ id: String, left: String, right: String }],
  difficulty: { type: String, enum: ["easy","medium","hard"], default: "medium" },
  tags:   [String],
  groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
const Question = mongoose.model("Question", questionSchema);

const GROUP_TYPES = ["1 of 2", "2 of 5", "1 of 3", "4 of 10"];

const groupSchema = new mongoose.Schema({
  groupId:      { type: String, required: true, unique: true, trim: true },
  name:         { type: String, default: "" },
  description:  { type: String, default: "" },
  groupType:    { type: String, enum: GROUP_TYPES, default: null },
  questions:    [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }],
  testCategory: [{ type: mongoose.Schema.Types.ObjectId, ref: "TestCategory" }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const Group = mongoose.model('Group', groupSchema);

const studentResultSchema = new mongoose.Schema({
  testCategory: { type: mongoose.Schema.Types.ObjectId, ref: "TestCategory", required: true },
  rollNo:       { type: String, required: true },
  name:         { type: String, required: true },
  score:        { type: Number, required: true },
  totalMarks:   { type: Number, required: false },
  grade:        { type: String, required: true },
  percentage:   { type: Number, required: false },
  answers:      { type: Array, required: true },
  timeSpent:    { type: Number, required: true },
  submittedAt:  { type: Date, required: false },
  createdAt:    { type: Date, default: Date.now }
});
const StudentResult = mongoose.model('StudentResult', studentResultSchema);

const testTimerSchema = new mongoose.Schema({
  testCategory:       { type: mongoose.Schema.Types.ObjectId, ref: "TestCategory", required: true, unique: true },
  sampleTestDuration: { type: Number, required: true },
  liveTestDuration:   { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const TestTimer = mongoose.model('TestTimer', testTimerSchema);

// ─── Marks Schemas ────────────────────────────────────────────────────────────

const questionTestMarksSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true },
  testCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: "TestCategory", required: true },
  marks: { type: Number, required: true, min: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

questionTestMarksSchema.index({ questionId: 1, testCategoryId: 1 }, { unique: true });
const QuestionTestMarks = mongoose.model('QuestionTestMarks', questionTestMarksSchema);

const groupTestMarksSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  testCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: "TestCategory", required: true },
  marks: { type: Number, required: true, min: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

groupTestMarksSchema.index({ groupId: 1, testCategoryId: 1 }, { unique: true });
const GroupTestMarks = mongoose.model('GroupTestMarks', groupTestMarksSchema);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateSlug = (name) =>
  slugify(name, { lower: true, strict: true, remove: /[*+~.()'"!:@]/g });

const syncGroupsForQuestion = async (questionId, groupIds = []) => {
  if (groupIds.length > 0) {
    await Group.updateMany(
      { _id: { $in: groupIds } },
      { $addToSet: { questions: questionId } }
    );
  }
  await Group.updateMany(
    { _id: { $nin: groupIds }, questions: questionId },
    { $pull: { questions: questionId } }
  );
};

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
      return res.status(400).json({ error: 'Missing required fields' });

    let category = await TestCategory.findOne({ slug: testCategory });
    if (!category && mongoose.Types.ObjectId.isValid(testCategory))
      category = await TestCategory.findById(testCategory);
    if (!category) return res.status(400).json({ error: 'Test category not found' });
    if (sampleTestDuration <= 0 || liveTestDuration <= 0)
      return res.status(400).json({ error: 'Duration must be greater than 0 minutes' });

    let timer = await TestTimer.findOne({ testCategory: category._id });
    if (timer) {
      timer.sampleTestDuration = sampleTestDuration;
      timer.liveTestDuration   = liveTestDuration;
      timer.updatedAt = new Date();
      await timer.save();
    } else {
      timer = new TestTimer({ testCategory: category._id, sampleTestDuration, liveTestDuration });
      await timer.save();
    }
    res.status(201).json({ success: true, message: 'Timer saved', data: { testCategory: category.name, testCategorySlug: category.slug, sampleTestDuration: timer.sampleTestDuration, liveTestDuration: timer.liveTestDuration, updatedAt: timer.updatedAt } });
  } catch (error) {
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
    if (!timer) return res.json({ testCategory: category.name, testCategorySlug: category.slug, sampleTestDuration: 30, liveTestDuration: 60, isDefault: true, message: 'Using default timer settings' });
    res.json({ testCategory: category.name, testCategorySlug: category.slug, sampleTestDuration: timer.sampleTestDuration, liveTestDuration: timer.liveTestDuration, updatedAt: timer.updatedAt, isDefault: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/test-timers', async (req, res) => {
  try {
    const timers = await TestTimer.find().populate('testCategory', 'name slug').sort({ createdAt: -1 });
    res.json(timers.map(t => ({ testCategory: t.testCategory.name, testCategorySlug: t.testCategory.slug, sampleTestDuration: t.sampleTestDuration, liveTestDuration: t.liveTestDuration, updatedAt: t.updatedAt })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Question Routes ──────────────────────────────────────────────────────────

app.get("/api/questions", async (req, res) => {
  try {
    const { type, difficulty, testCategory } = req.query;
    const query = {};

    if (testCategory) {
      const category = await TestCategory.findOne({ slug: testCategory });
      if (!category) return res.status(400).json({ error: "Test category not found" });
      query.testCategory = category._id;
    }
    if (type)        query.type = type;
    if (difficulty)  query.difficulty = difficulty;

    const questions = await Question.find(query)
      .populate('testCategory', 'name slug')
      .populate('groups', 'groupId name groupType')
      .sort({ createdAt: -1 });
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/questions", async (req, res) => {
  try {
    const {
      type, question,
      questionName = "",
      testCategory = [],
      image = "",
      defaultMarks = 1,
      groups = []
    } = req.body;

    if (!type || !question)
      return res.status(400).json({ error: "Missing required fields (type, question)" });

    const categoryIds = [];
    const slugList = Array.isArray(testCategory) ? testCategory : [testCategory].filter(Boolean);
    for (const slug of slugList) {
      const cat = await TestCategory.findOne({ slug });
      if (!cat) return res.status(400).json({ error: `Test category "${slug}" not found` });
      categoryIds.push(cat._id);
    }

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
      case "numeric":
        if (req.body.correctAnswer === undefined || req.body.correctAnswer === null)
          validationError = "Numeric questions require a correctAnswer (number)";
        break;
    }
    if (validationError) return res.status(400).json({ error: validationError });

    if (groups.length > 0) {
      const validGroups = await Group.find({ _id: { $in: groups } }).select('_id');
      if (validGroups.length !== groups.length)
        return res.status(400).json({ error: "One or more group IDs are invalid" });
    }

    const questionData = {
      testCategory: categoryIds,
      questionName,
      type, question, image,
      defaultMarks: Number(defaultMarks) >= 0 ? Number(defaultMarks) : 1,
      difficulty: req.body.difficulty || "medium",
      tags: req.body.tags || [],
      groups,
      ...(type === "multiple-choice" && { options: req.body.options, correctAnswer: req.body.correctAnswer }),
      ...(type === "short-answer"    && { correctAnswer: req.body.correctAnswer }),
      ...(type === "drag-and-drop"   && { items: req.body.items, correctOrder: req.body.correctOrder }),
      ...(type === "match-pairs"     && { pairs: req.body.pairs }),
      ...(type === "text"    && req.body.correctAnswer !== undefined && { correctAnswer: req.body.correctAnswer }),
      ...(type === "numeric" && { correctAnswer: Number(req.body.correctAnswer) }),
    };

    const newQuestion = new Question(questionData);
    await newQuestion.save();
    await syncGroupsForQuestion(newQuestion._id, groups);

    const populated = await Question.findById(newQuestion._id)
      .populate('testCategory', 'name slug')
      .populate('groups', 'groupId name groupType');
    res.status(201).json(populated);
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
      if (category) match.testCategory = category._id;
      else return res.json({ totalQuestions: 0, difficultyLevels: 0, totalMarks: 0 });
    }
    const counts = await Question.aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: 1 }, types: { $addToSet: "$type" }, difficulties: { $addToSet: "$difficulty" }, totalMarks: { $sum: { $ifNull: ["$defaultMarks", 1] } } } }
    ]);
    const r = counts[0] || { total: 0, types: [], difficulties: [], totalMarks: 0 };
    res.json({ totalQuestions: r.total, questionTypes: r.types.length, difficultyLevels: r.difficulties.length, totalMarks: r.totalMarks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/questions/:id", async (req, res) => {
  try {
    const question = await Question.findById(req.params.id)
      .populate('testCategory', 'name slug')
      .populate('groups', 'groupId name groupType');
    if (!question) return res.status(404).json({ error: "Question not found" });
    res.json(question);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/questions/:id", async (req, res) => {
  try {
    const { testCategory, defaultMarks, groups, ...updateData } = req.body;

    if (testCategory !== undefined) {
      const slugList = Array.isArray(testCategory) ? testCategory : [testCategory].filter(Boolean);
      const categoryIds = [];
      for (const slug of slugList) {
        let cat = await TestCategory.findOne({ slug });
        if (!cat && mongoose.Types.ObjectId.isValid(slug)) cat = await TestCategory.findById(slug);
        if (cat) categoryIds.push(cat._id);
      }
      updateData.testCategory = categoryIds;
    }

    if (defaultMarks !== undefined) updateData.defaultMarks = Number(defaultMarks) >= 0 ? Number(defaultMarks) : 1;

    if (groups !== undefined) {
      if (groups.length > 0) {
        const validGroups = await Group.find({ _id: { $in: groups } }).select('_id');
        if (validGroups.length !== groups.length)
          return res.status(400).json({ error: "One or more group IDs are invalid" });
      }
      updateData.groups = groups;
    }

    updateData.updatedAt = new Date();

    const updatedQuestion = await Question.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true })
      .populate('testCategory', 'name slug')
      .populate('groups', 'groupId name groupType');

    if (!updatedQuestion) return res.status(404).json({ error: "Question not found" });

    if (groups !== undefined) {
      await syncGroupsForQuestion(updatedQuestion._id, updatedQuestion.groups);
    }

    res.json(updatedQuestion);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/questions/:id", async (req, res) => {
  try {
    const deletedQuestion = await Question.findByIdAndDelete(req.params.id);
    if (!deletedQuestion) return res.status(404).json({ error: "Question not found" });
    await Group.updateMany({ questions: req.params.id }, { $pull: { questions: req.params.id } });
    await QuestionTestMarks.deleteMany({ questionId: req.params.id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Question Test Marks Routes ───────────────────────────────────────────────

app.get('/api/questions/:questionId/marks', async (req, res) => {
  try {
    const { questionId } = req.params;
    const { testCategory } = req.query;
    
    if (!testCategory) {
      return res.status(400).json({ error: 'testCategory query parameter is required' });
    }
    
    const category = await TestCategory.findOne({ slug: testCategory });
    if (!category) {
      return res.status(404).json({ error: 'Test category not found' });
    }
    
    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    const testMarks = await QuestionTestMarks.findOne({
      questionId: question._id,
      testCategoryId: category._id
    });
    
    const groups = await Group.find({ questions: question._id });
    let groupMarks = null;
    let groupInfo = null;
    
    for (const group of groups) {
      const groupMark = await GroupTestMarks.findOne({
        groupId: group._id,
        testCategoryId: category._id
      });
      if (groupMark) {
        groupMarks = groupMark.marks;
        groupInfo = { groupId: group.groupId, groupName: group.name };
        break;
      }
    }
    
    let effectiveMarks = question.defaultMarks;
    let source = 'default';
    
    if (groupMarks !== null) {
      effectiveMarks = groupMarks;
      source = 'group';
    } else if (testMarks) {
      effectiveMarks = testMarks.marks;
      source = 'test-specific';
    }
    
    res.json({
      questionId: question._id,
      testCategory: category.slug,
      defaultMarks: question.defaultMarks,
      testSpecificMarks: testMarks ? testMarks.marks : null,
      groupMarks: groupMarks,
      groupInfo: groupInfo,
      effectiveMarks: effectiveMarks,
      source: source
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/questions/:questionId/marks', async (req, res) => {
  try {
    const { questionId } = req.params;
    const { testCategory, marks } = req.body;
    
    if (!testCategory || marks === undefined) {
      return res.status(400).json({ error: 'testCategory and marks are required' });
    }
    
    const category = await TestCategory.findOne({ slug: testCategory });
    if (!category) {
      return res.status(404).json({ error: 'Test category not found' });
    }
    
    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    if (marks < 0) {
      return res.status(400).json({ error: 'Marks cannot be negative' });
    }
    
    const testMarks = await QuestionTestMarks.findOneAndUpdate(
      { questionId: question._id, testCategoryId: category._id },
      { marks, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    
    res.json({
      success: true,
      message: `Marks set to ${marks} for question in test category "${testCategory}"`,
      data: {
        questionId: question._id,
        testCategory: category.slug,
        marks: testMarks.marks
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/questions/:questionId/marks', async (req, res) => {
  try {
    const { questionId } = req.params;
    const { testCategory } = req.query;
    
    if (!testCategory) {
      return res.status(400).json({ error: 'testCategory query parameter is required' });
    }
    
    const category = await TestCategory.findOne({ slug: testCategory });
    if (!category) {
      return res.status(404).json({ error: 'Test category not found' });
    }
    
    const result = await QuestionTestMarks.findOneAndDelete({
      questionId,
      testCategoryId: category._id
    });
    
    if (!result) {
      return res.status(404).json({ error: 'No marks configuration found for this question and test category' });
    }
    
    res.json({
      success: true,
      message: `Test-specific marks removed for question in test category "${testCategory}"`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/questions/marks/bulk', async (req, res) => {
  try {
    const { testCategory, questionMarks } = req.body;
    
    if (!testCategory || !questionMarks || !Array.isArray(questionMarks)) {
      return res.status(400).json({ error: 'testCategory and questionMarks array are required' });
    }
    
    const category = await TestCategory.findOne({ slug: testCategory });
    if (!category) {
      return res.status(404).json({ error: 'Test category not found' });
    }
    
    const operations = [];
    for (const item of questionMarks) {
      operations.push({
        updateOne: {
          filter: { questionId: item.questionId, testCategoryId: category._id },
          update: { marks: item.marks, updatedAt: new Date() },
          upsert: true
        }
      });
    }
    
    const result = await QuestionTestMarks.bulkWrite(operations);
    
    res.json({
      success: true,
      message: `Updated marks for ${result.modifiedCount + result.upsertedCount} questions`,
      details: result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/test-categories/:slug/questions-with-marks', async (req, res) => {
  try {
    const { slug } = req.params;
    
    const category = await TestCategory.findOne({ slug });
    if (!category) {
      return res.status(404).json({ error: 'Test category not found' });
    }
    
    const questions = await Question.find({
      testCategory: category._id
    }).populate('groups', 'groupId name groupType');
    
    const questionIds = questions.map(q => q._id);
    const testMarks = await QuestionTestMarks.find({
      questionId: { $in: questionIds },
      testCategoryId: category._id
    });
    
    const allGroups = await Group.find({ questions: { $in: questionIds } });
    const groupIds = allGroups.map(g => g._id);
    const groupMarks = await GroupTestMarks.find({
      groupId: { $in: groupIds },
      testCategoryId: category._id
    });
    
    const testMarksMap = new Map();
    testMarks.forEach(tm => {
      testMarksMap.set(tm.questionId.toString(), tm.marks);
    });
    
    const groupMarksMap = new Map();
    groupMarks.forEach(gm => {
      groupMarksMap.set(gm.groupId.toString(), gm.marks);
    });
    
    const questionsWithMarks = questions.map(question => {
      let effectiveMarks = question.defaultMarks;
      let marksSource = 'default';
      let groupMark = null;
      let groupInfo = null;
      
      for (const group of question.groups || []) {
        const groupId = typeof group === 'object' ? group._id.toString() : group.toString();
        if (groupMarksMap.has(groupId)) {
          groupMark = groupMarksMap.get(groupId);
          groupInfo = { 
            groupId: typeof group === 'object' ? group.groupId : group, 
            groupName: typeof group === 'object' ? group.name : null,
            groupType: typeof group === 'object' ? group.groupType : null
          };
          break;
        }
      }
      
      if (groupMark !== null) {
        effectiveMarks = groupMark;
        marksSource = 'group';
      } else if (testMarksMap.has(question._id.toString())) {
        effectiveMarks = testMarksMap.get(question._id.toString());
        marksSource = 'test-specific';
      }
      
      return {
        ...question.toObject(),
        effectiveMarks,
        marksSource,
        defaultMarks: question.defaultMarks,
        testSpecificMarks: testMarksMap.get(question._id.toString()) || null,
        groupMarks: groupMark,
        groupInfo
      };
    });
    
    res.json(questionsWithMarks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Group Routes ─────────────────────────────────────────────────────────────

app.post('/api/groups', async (req, res) => {
  try {
    const { groupId, name = "", description = "", questions = [], testCategory = [], groupType = null } = req.body;
    if (!groupId) return res.status(400).json({ error: 'groupId is required' });

    const existing = await Group.findOne({ groupId });
    if (existing) return res.status(400).json({ error: 'Group with this groupId already exists' });

    if (groupType && !GROUP_TYPES.includes(groupType)) {
      return res.status(400).json({ error: `Invalid groupType. Must be one of: ${GROUP_TYPES.join(', ')}` });
    }

    const slugList = Array.isArray(testCategory) ? testCategory : [testCategory].filter(Boolean);
    const categoryIds = [];
    for (const slug of slugList) {
      const cat = await TestCategory.findOne({ slug });
      if (cat) categoryIds.push(cat._id);
    }

    if (questions.length > 0) {
      const validQs = await Question.find({ _id: { $in: questions } }).select('_id');
      if (validQs.length !== questions.length)
        return res.status(400).json({ error: 'One or more question IDs are invalid' });
    }

    const newGroup = new Group({ groupId, name, description, questions, testCategory: categoryIds, groupType });
    await newGroup.save();

    if (questions.length > 0) {
      await Question.updateMany({ _id: { $in: questions } }, { $addToSet: { groups: newGroup._id } });
    }

    const populated = await Group.findById(newGroup._id)
      .populate('questions', 'question type difficulty defaultMarks questionName')
      .populate('testCategory', 'name slug');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/groups', async (req, res) => {
  try {
    const { testCategory } = req.query;
    const query = {};
    if (testCategory) {
      const category = await TestCategory.findOne({ slug: testCategory });
      if (category) query.testCategory = category._id;
    }
    const groups = await Group.find(query)
      .populate('questions', 'question type difficulty defaultMarks questionName')
      .populate('testCategory', 'name slug')
      .sort({ createdAt: -1 });
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/groups/:groupId', async (req, res) => {
  try {
    const group = await Group.findOne({ groupId: req.params.groupId })
      .populate('questions', 'question type difficulty defaultMarks questionName')
      .populate('testCategory', 'name slug');
    if (!group) return res.status(404).json({ error: 'Group not found' });
    res.json(group);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/groups/:groupId', async (req, res) => {
  try {
    const { questions, testCategory, groupType, ...updateData } = req.body;

    if (groupType !== undefined) {
      if (groupType !== null && !GROUP_TYPES.includes(groupType)) {
        return res.status(400).json({ error: `Invalid groupType. Must be one of: ${GROUP_TYPES.join(', ')}` });
      }
      updateData.groupType = groupType;
    }

    if (questions !== undefined) {
      if (questions.length > 0) {
        const validQs = await Question.find({ _id: { $in: questions } }).select('_id');
        if (validQs.length !== questions.length)
          return res.status(400).json({ error: 'One or more question IDs are invalid' });
      }
      updateData.questions = questions;
    }

    if (testCategory !== undefined) {
      const slugList = Array.isArray(testCategory) ? testCategory : [testCategory].filter(Boolean);
      const categoryIds = [];
      for (const slug of slugList) {
        const cat = await TestCategory.findOne({ slug });
        if (cat) categoryIds.push(cat._id);
      }
      updateData.testCategory = categoryIds;
    }

    updateData.updatedAt = new Date();

    const oldGroup = await Group.findOne({ groupId: req.params.groupId });
    if (!oldGroup) return res.status(404).json({ error: 'Group not found' });

    const updatedGroup = await Group.findOneAndUpdate(
      { groupId: req.params.groupId },
      updateData,
      { new: true, runValidators: true }
    ).populate('questions', 'question type difficulty defaultMarks questionName')
     .populate('testCategory', 'name slug');

    if (questions !== undefined) {
      const newQIds = questions.map(id => id.toString());
      const oldQIds = oldGroup.questions.map(id => id.toString());
      const added   = newQIds.filter(id => !oldQIds.includes(id));
      const removed = oldQIds.filter(id => !newQIds.includes(id));
      if (added.length)   await Question.updateMany({ _id: { $in: added } },   { $addToSet: { groups: updatedGroup._id } });
      if (removed.length) await Question.updateMany({ _id: { $in: removed } }, { $pull: { groups: updatedGroup._id } });
    }

    res.json(updatedGroup);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/groups/:groupId', async (req, res) => {
  try {
    const deletedGroup = await Group.findOneAndDelete({ groupId: req.params.groupId });
    if (!deletedGroup) return res.status(404).json({ error: 'Group not found' });
    await Question.updateMany({ groups: deletedGroup._id }, { $pull: { groups: deletedGroup._id } });
    await GroupTestMarks.deleteMany({ groupId: deletedGroup._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Group Test Marks Routes ─────────────────────────────────────────────────

app.get('/api/groups/:groupId/marks', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { testCategory } = req.query;
    
    if (!testCategory) {
      return res.status(400).json({ error: 'testCategory query parameter is required' });
    }
    
    const category = await TestCategory.findOne({ slug: testCategory });
    if (!category) {
      return res.status(404).json({ error: 'Test category not found' });
    }
    
    const group = await Group.findOne({ groupId });
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    const groupMarks = await GroupTestMarks.findOne({
      groupId: group._id,
      testCategoryId: category._id
    });
    
    res.json({
      groupId: group.groupId,
      testCategory: category.slug,
      marks: groupMarks ? groupMarks.marks : null,
      hasCustomMarks: !!groupMarks
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/groups/:groupId/marks', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { testCategory, marks } = req.body;
    
    if (!testCategory || marks === undefined) {
      return res.status(400).json({ error: 'testCategory and marks are required' });
    }
    
    const category = await TestCategory.findOne({ slug: testCategory });
    if (!category) {
      return res.status(404).json({ error: 'Test category not found' });
    }
    
    const group = await Group.findOne({ groupId });
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    if (marks < 0) {
      return res.status(400).json({ error: 'Marks cannot be negative' });
    }
    
    const groupMarks = await GroupTestMarks.findOneAndUpdate(
      { groupId: group._id, testCategoryId: category._id },
      { marks, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    
    res.json({
      success: true,
      message: `All questions in group "${group.groupId}" will now use ${marks} marks in test category "${testCategory}"`,
      data: {
        groupId: group.groupId,
        testCategory: category.slug,
        marks: groupMarks.marks,
        totalQuestions: group.questions.length
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/groups/:groupId/marks', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { testCategory } = req.query;
    
    if (!testCategory) {
      return res.status(400).json({ error: 'testCategory query parameter is required' });
    }
    
    const category = await TestCategory.findOne({ slug: testCategory });
    if (!category) {
      return res.status(404).json({ error: 'Test category not found' });
    }
    
    const group = await Group.findOne({ groupId });
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }
    
    const result = await GroupTestMarks.findOneAndDelete({
      groupId: group._id,
      testCategoryId: category._id
    });
    
    if (!result) {
      return res.status(404).json({ error: 'No group marks configuration found' });
    }
    
    res.json({
      success: true,
      message: `Group-level marks removed for test category "${testCategory}"`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/groups/:groupId/add-to-test-category', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { testCategory } = req.body;
    if (!testCategory) return res.status(400).json({ error: 'testCategory slug is required' });

    const category = await TestCategory.findOne({ slug: testCategory });
    if (!category) return res.status(404).json({ error: 'Test category not found' });

    const group = await Group.findOne({ groupId });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const questions = await Question.find({ _id: { $in: group.questions } });
    if (questions.length === 0) return res.status(400).json({ error: 'No questions found in this group' });

    const updatedQuestions = [];
    for (const question of questions) {
      const currentCategories = question.testCategory || [];
      const categoryIds = currentCategories.map(id => id.toString());
      if (!categoryIds.includes(category._id.toString())) {
        question.testCategory = [...currentCategories, category._id];
        await question.save();
        updatedQuestions.push(question._id);
      }
    }

    const currentGroupCategories = group.testCategory || [];
    const groupCategoryIds = currentGroupCategories.map(id => id.toString());
    if (!groupCategoryIds.includes(category._id.toString())) {
      group.testCategory = [...currentGroupCategories, category._id];
      await group.save();
    }

    res.json({ success: true, message: `Added ${updatedQuestions.length} questions to test category "${testCategory}"`, questionsAdded: updatedQuestions.length, totalQuestions: questions.length, groupUpdated: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/groups/:groupId/questions-not-in-category', async (req, res) => {
  try {
    const { groupId } = req.params;
    const { testCategory } = req.query;
    if (!testCategory) return res.status(400).json({ error: 'testCategory query parameter is required' });

    const category = await TestCategory.findOne({ slug: testCategory });
    if (!category) return res.status(404).json({ error: 'Test category not found' });

    const group = await Group.findOne({ groupId });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const questions = await Question.find({
      _id: { $in: group.questions },
      testCategory: { $nin: [category._id] }
    }).populate('testCategory', 'name slug');

    res.json({ groupId: group.groupId, totalQuestionsInGroup: group.questions.length, questionsNotInCategory: questions.length, questions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Test Endpoints ───────────────────────────────────────────────────────────

app.get("/api/sample-test/:grade", async (req, res) => {
  try {
    const { grade } = req.params;
    const { testCategory } = req.query;
    const query = { grade };
    if (testCategory) {
      const cat = await TestCategory.findOne({ slug: testCategory });
      if (cat) query.testCategory = cat._id;
    }
    const questions = await Question.find(query).limit(10);
    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/live-test/:grade", async (req, res) => {
  try {
    const { grade } = req.params;
    const { testCategory } = req.query;
    const query = { grade };
    if (testCategory) {
      const cat = await TestCategory.findOne({ slug: testCategory });
      if (cat) query.testCategory = cat._id;
    }
    const questions = await Question.find(query).limit(20);
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
    if (existingResult)
      return res.status(200).json({ success: false, message: 'Score not updated - only first assessment is recorded' });

    const newResult = new StudentResult({
      testCategory: category._id,
      rollNo: student.rollNo, name: student.name,
      score:      analysis.marksEarned ?? analysis.correctCount,
      totalMarks: analysis.totalMarks  ?? analysis.totalQuestions,
      grade: analysis.grade || "default", percentage: analysis.percentage,
      answers, timeSpent, submittedAt
    });
    await newResult.save();
    res.json({ success: true, message: 'Score recorded successfully', result: newResult });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save results: ' + error.message });
  }
});

app.get('/api/results/:rollNo/:testCategory', async (req, res) => {
  try {
    const { rollNo, testCategory } = req.params;
    const category = await TestCategory.findOne({ slug: testCategory });
    if (!category) return res.status(404).json({ error: 'Test category not found' });
    const existingResult = await StudentResult.findOne({ rollNo, testCategory: category._id });
    if (existingResult) {
      res.json({ hasTakenTest: true, student: { rollNo: existingResult.rollNo, name: existingResult.name, score: existingResult.score, totalMarks: existingResult.totalMarks, grade: existingResult.grade, percentage: existingResult.percentage, submittedAt: existingResult.submittedAt } });
    } else {
      res.json({ hasTakenTest: false });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to check student results' });
  }
});

app.get('/api/results', async (req, res) => {
  try {
    const { testCategory } = req.query;
    let query = {};
    if (testCategory) {
      let category = mongoose.Types.ObjectId.isValid(testCategory)
        ? await TestCategory.findById(testCategory)
        : await TestCategory.findOne({ slug: testCategory });
      if (category) query.testCategory = category._id;
      else return res.json([]);
    }
    const results = await StudentResult.find(query).populate('testCategory', 'name slug').sort({ createdAt: -1 }).lean();
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch results', message: error.message });
  }
});

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', dbStatus: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected', timestamp: new Date() });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));