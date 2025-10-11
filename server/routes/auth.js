const express = require('express');
const mongoose = require('mongoose');
const { logger } = require('../datadog');

const router = express.Router();

// User schema for MongoDB
const userSchema = new mongoose.Schema({
  fullname: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['client', 'trainer'], default: 'client' },
  
  // Client-specific fields
  goal: { type: String, required: function() { return this.role === 'client'; } },
  
  // Trainer-specific fields
  specialization: { type: String, required: function() { return this.role === 'trainer'; } },
  experience: { type: String, required: function() { return this.role === 'trainer'; } },
  certification: { type: String, default: '' } // Optional for trainers
});

const User = mongoose.model('User', userSchema);

// Workout schema for MongoDB
const workoutSchema = new mongoose.Schema({
  email: { type: String, required: true },
  type: { type: String, required: true },
  duration: { type: Number, required: true },
  calories: { type: Number, required: true },
  date: { type: String, required: true },
  notes: { type: String, default: '' }
});

const Workout = mongoose.model('Workout', workoutSchema);

// Metrics schema for MongoDB
const metricsSchema = new mongoose.Schema({
  email: { type: String, required: true },
  date: { type: String, required: true },
  weight: { type: Number, required: true },
  bmi: { type: Number, required: true },
  fat: { type: Number, default: 0 }
});

const Metrics = mongoose.model('Metrics', metricsSchema);

// Trainer Plan schema for MongoDB
const planSchema = new mongoose.Schema({
  trainer: { type: String, required: true }, // trainer email
  client: { type: String, required: true },
  plan: { type: String, required: true }
});
const Plan = mongoose.model('Plan', planSchema);

// Register
router.post('/register', async (req, res) => {
  // Log raw request for debugging
  logger.info('REGISTER ENDPOINT HIT', {
    method: req.method,
    url: req.url,
    body: req.body,
    headers: req.headers,
    action: 'register_endpoint_accessed'
  });
  
  logger.info('User registration attempt', {
    email: req.body.email,
    role: req.body.role,
    action: 'registration_started'
  });
  
  const { fullname, email, password, role, goal, specialization, experience, certification } = req.body;
  
  // Basic validation for all users
  if (!fullname || !email || !password || !role) {
    logger.warn('Registration failed - missing required fields', {
      email,
      missingFields: !fullname ? 'fullname' : !email ? 'email' : !password ? 'password' : 'role'
    });
    return res.status(400).json({ msg: 'Full name, email, password, and role are required' });
  }
  
  // Role-specific validation
  if (role === 'client' && !goal) {
    logger.warn('Registration failed - client missing goal', { email, role });
    return res.status(400).json({ msg: 'Fitness goal is required for client registration' });
  }
  
  if (role === 'trainer' && (!specialization || !experience)) {
    logger.warn('Registration failed - trainer missing required fields', {
      email,
      role,
      missingSpecialization: !specialization,
      missingExperience: !experience
    });
    return res.status(400).json({ msg: 'Specialization and experience are required for trainer registration' });
  }

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      logger.warn('Registration failed - user already exists', {
        email,
        action: 'duplicate_user_attempt'
      });
      return res.status(400).json({ msg: 'User already exists' });
    }

    // Create user object based on role
    const userData = {
      fullname,
      email,
      password,
      role
    };
    
    // Add role-specific fields
    if (role === 'client') {
      userData.goal = goal;
    } else if (role === 'trainer') {
      userData.specialization = specialization;
      userData.experience = experience;
      userData.certification = certification || '';
    }
    
    const newUser = new User(userData);
    await newUser.save();
    
    logger.info('User registration successful', {
      email: newUser.email,
      role: newUser.role,
      action: 'registration_completed',
      userId: newUser._id.toString()
    });
    
    res.status(201).json({ msg: 'Registered successfully' });
  } catch (err) {
    logger.error('Registration error', {
      email,
      error: err.message,
      action: 'registration_failed'
    });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  // Log raw request for debugging
  logger.info('LOGIN ENDPOINT HIT', {
    method: req.method,
    url: req.url,
    body: req.body,
    headers: req.headers,
    action: 'login_endpoint_accessed'
  });
  
  const { email, password, role } = req.body;
  
  logger.info('User login attempt', {
    email,
    role,
    action: 'login_started'
  });
  
  if (!email || !password || !role) {
    logger.warn('Login failed - missing required fields', {
      email,
      role,
      missingFields: !email ? 'email' : !password ? 'password' : 'role'
    });
    return res.status(400).json({ msg: 'All fields are required' });
  }

  try {
    const user = await User.findOne({ email, password, role });
    if (!user) {
      logger.warn('Login failed - invalid credentials', {
        email,
        role,
        action: 'invalid_credentials'
      });
      return res.status(400).json({ msg: 'Invalid credentials or role' });
    }

    // Base response
    const response = {
      success: true,
      fullname: user.fullname,
      email: user.email,
      role: user.role
    };
    
    // Add role-specific fields
    if (user.role === 'client') {
      response.goal = user.goal;
    } else if (user.role === 'trainer') {
      response.specialization = user.specialization;
      response.experience = user.experience;
      response.certification = user.certification;
    }

    logger.info('User login successful', {
      email: user.email,
      role: user.role,
      action: 'login_completed',
      userId: user._id.toString()
    });

    res.json(response);
  } catch (err) {
    logger.error('Login error', {
      email,
      role,
      error: err.message,
      action: 'login_failed'
    });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// Log workout
router.post('/log-workout', async (req, res) => {
  const { email, type, duration, calories, date, notes } = req.body;
  
  logger.info('Workout logging attempt', {
    email,
    type,
    duration,
    calories,
    action: 'workout_log_started'
  });
  
  if (!email || !type || !duration || !calories || !date) {
    logger.warn('Workout logging failed - missing fields', {
      email,
      missingFields: { email: !email, type: !type, duration: !duration, calories: !calories, date: !date }
    });
    return res.status(400).json({ msg: 'All required fields are missing' });
  }
  
  try {
    const workout = new Workout({ 
      email, 
      type, 
      duration: parseInt(duration), 
      calories: parseInt(calories), 
      date,
      notes: notes || ''
    });
    
    await workout.save();
    
    logger.info('Workout logged successfully', {
      email,
      type,
      duration: parseInt(duration),
      calories: parseInt(calories),
      action: 'workout_logged',
      workoutId: workout._id.toString()
    });
    
    res.json({ success: true, msg: 'Workout logged' });
  } catch (err) {
    logger.error('Workout logging error', {
      email,
      type,
      error: err.message,
      action: 'workout_log_failed'
    });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// Get workouts for progress page
router.get('/workouts/:email', async (req, res) => {
  logger.info('Fetching workouts', {
    email: req.params.email,
    action: 'workouts_fetch_started'
  });
  
  try {
    const workouts = await Workout.find({ email: req.params.email });
    
    logger.info('Workouts fetched successfully', {
      email: req.params.email,
      workoutsCount: workouts.length,
      action: 'workouts_fetched'
    });
    
    res.json({ success: true, workouts });
  } catch (err) {
    logger.error('Workouts fetch error', {
      email: req.params.email,
      error: err.message,
      action: 'workouts_fetch_failed'
    });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// Store metrics
router.post('/metrics', async (req, res) => {
  const { email, date, weight, bmi, fat } = req.body;
  
  logger.info('Metrics storage attempt', {
    email,
    date,
    weight,
    bmi,
    fat: fat || 0,
    action: 'metrics_storage_started'
  });
  
  if (!email || !date || !weight || !bmi) {
    logger.warn('Metrics storage failed - missing fields', {
      email,
      missingFields: { email: !email, date: !date, weight: !weight, bmi: !bmi }
    });
    return res.status(400).json({ msg: 'All required fields must be provided' });
  }
  
  try {
    const metrics = new Metrics({ 
      email, 
      date, 
      weight, 
      bmi, 
      fat: fat || 0 
    });
    
    await metrics.save();
    
    logger.info('Metrics stored successfully', {
      email,
      date,
      weight,
      bmi,
      fat: fat || 0,
      action: 'metrics_stored',
      metricsId: metrics._id.toString()
    });
    
    res.json({ success: true, msg: 'Metrics updated' });
  } catch (err) {
    logger.error('Metrics storage error', {
      email,
      error: err.message,
      action: 'metrics_storage_failed'
    });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// Get metrics for progress page
router.get('/metrics/:email', async (req, res) => {
  logger.info('Fetching metrics', {
    email: req.params.email,
    action: 'metrics_fetch_started'
  });
  
  try {
    const metrics = await Metrics.find({ email: req.params.email });
    
    logger.info('Metrics fetched successfully', {
      email: req.params.email,
      metricsCount: metrics.length,
      action: 'metrics_fetched'
    });
    
    res.json({ success: true, metrics });
  } catch (err) {
    logger.error('Metrics fetch error', {
      email: req.params.email,
      error: err.message,
      action: 'metrics_fetch_failed'
    });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// Assign a new plan
router.post('/plans', async (req, res) => {
  const { trainer, client, plan } = req.body;
  
  logger.info('Plan assignment attempt', {
    trainer,
    client,
    planLength: plan?.length || 0,
    action: 'plan_assignment_started'
  });
  
  if (!trainer || !client || !plan) {
    logger.warn('Plan assignment failed - missing fields', {
      trainer,
      client,
      hasPlan: !!plan,
      action: 'plan_assignment_validation_failed'
    });
    return res.status(400).json({ msg: 'All fields are required' });
  }
  
  try {
    const newPlan = new Plan({ trainer, client, plan });
    await newPlan.save();
    
    logger.info('Plan assigned successfully', {
      trainer,
      client,
      planId: newPlan._id.toString(),
      action: 'plan_assigned'
    });
    
    res.json({ success: true, msg: 'Plan assigned' });
  } catch (err) {
    logger.error('Plan assignment error', {
      trainer,
      client,
      error: err.message,
      action: 'plan_assignment_failed'
    });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// Get all plans assigned by a trainer
router.get('/plans/:trainer', async (req, res) => {
  logger.info('Fetching trainer plans', {
    trainer: req.params.trainer,
    action: 'trainer_plans_fetch_started'
  });
  
  try {
    const plans = await Plan.find({ trainer: req.params.trainer });
    
    logger.info('Trainer plans fetched successfully', {
      trainer: req.params.trainer,
      plansCount: plans.length,
      action: 'trainer_plans_fetched'
    });
    
    res.json({ success: true, plans });
  } catch (err) {
    logger.error('Trainer plans fetch error', {
      trainer: req.params.trainer,
      error: err.message,
      action: 'trainer_plans_fetch_failed'
    });
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// Edit a plan
router.put('/plans/:id', async (req, res) => {
  const { client, plan } = req.body;
  try {
    await Plan.findByIdAndUpdate(req.params.id, { client, plan });
    res.json({ success: true, msg: 'Plan updated' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// Delete a plan
router.delete('/plans/:id', async (req, res) => {
  try {
    await Plan.findByIdAndDelete(req.params.id);
    res.json({ success: true, msg: 'Plan deleted' });
  } catch (err) {
    res.status(500).json({ msg: 'Server error', error: err.message });
  }
});

// Test endpoint to verify server connectivity
router.post('/test', (req, res) => {
  logger.info('Test endpoint accessed', {
    requestBody: req.body,
    action: 'test_endpoint_hit'
  });
  res.json({ success: true, msg: 'Test endpoint working', receivedData: req.body });
});

// Logout (for localStorage-based auth, this is client-side)
router.post('/logout', (req, res) => {
  res.json({ msg: 'Logged out on client side. No server session stored.' });
});

module.exports = router;