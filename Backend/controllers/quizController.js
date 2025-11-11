const Quiz = require('../models/Quiz');
const User = require('../models/User');
const QuizAssignment = require('../models/QuizAssignment');
const { sendQuizAssignmentEmail, sendAssignmentNotificationToAdmin, sendQuizCompletionEmail } = require('../services/emailService');
const mongoose = require('mongoose');

// Create new quiz
exports.createQuiz = async (req, res) => {
  try {
    const { title, description, questions, category, difficulty, timeLimit, isPublic } = req.body;

    // Validate questions structure
    if (!questions || questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Quiz must have at least one question'
      });
    }

    // Validate each question has correct answer
    for (let question of questions) {
      const correctOptions = question.options.filter(option => option.isCorrect);
      if (correctOptions.length !== 1) {
        return res.status(400).json({
          success: false,
          message: 'Each question must have exactly one correct answer'
        });
      }
    }

    const quiz = new Quiz({
      title,
      description,
      creator: req.userId,
      questions,
      category: category || 'General',
      difficulty: difficulty || 'medium',
      timeLimit,
      isPublic: isPublic !== undefined ? isPublic : true
    });

    await quiz.save();

    // Add quiz to user's created quizzes
    await User.findByIdAndUpdate(req.userId, {
      $push: { quizzesCreated: quiz._id }
    });

    res.status(201).json({
      success: true,
      message: 'Quiz created successfully',
      data: {
        quiz
      }
    });
  } catch (error) {
    console.error('Create quiz error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating quiz',
      error: error.message
    });
  }
};

// Get all public quizzes
exports.getPublicQuizzes = async (req, res) => {
  try {
    const { page = 1, limit = 10, category, difficulty, search } = req.query;
    
    let query = { isPublic: true };
    
    if (category) query.category = category;
    if (difficulty) query.difficulty = difficulty;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const quizzes = await Quiz.find(query)
      .populate('creator', 'firstName lastName')
      .select('-questions.options.isCorrect')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Quiz.countDocuments(query);

    res.json({
      success: true,
      data: {
        quizzes,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total
      }
    });
  } catch (error) {
    console.error('Get public quizzes error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching quizzes',
      error: error.message
    });
  }
};

// Get quiz by ID (for taking)
exports.getQuizForTaking = async (req, res) => {
  try {
    const { quizId } = req.params;

    const quiz = await Quiz.getQuizForTaking(quizId);
    
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    if (!quiz.isPublic && quiz.creator.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: {
        quiz
      }
    });
  } catch (error) {
    console.error('Get quiz error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching quiz',
      error: error.message
    });
  }
};

// Submit quiz attempt
exports.submitQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { answers, timeTaken } = req.body;

    // Fetch the full quiz with correct answers for scoring
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    // Check if user has access to this quiz (either public, creator, or assigned)
    const assignment = await QuizAssignment.findOne({
      quiz: quizId,
      assignedTo: req.userId,
      status: 'pending'
    });

    const hasAccess = quiz.isPublic || 
                     quiz.creator.toString() === req.userId || 
                     assignment;

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - You are not assigned to this quiz'
      });
    }

    // Calculate score
    let score = 0;
    const totalQuestions = quiz.questions.length;
    const processedAnswers = [];

    console.log('Quiz data for submission:', {
      quizId,
      totalQuestions,
      questionsCount: quiz.questions.length,
      firstQuestion: quiz.questions[0] ? {
        question: quiz.questions[0].question,
        optionsCount: quiz.questions[0].options.length,
        firstOption: quiz.questions[0].options[0]
      } : 'No questions'
    });

    for (let i = 0; i < totalQuestions; i++) {
      const question = quiz.questions[i];
      const userAnswer = answers[i];
      
      console.log(`Processing question ${i}:`, {
        questionText: question.question,
        userAnswer,
        optionsCount: question.options.length,
        options: question.options.map((opt, idx) => ({
          index: idx,
          text: opt.text,
          isCorrect: opt.isCorrect
        }))
      });
      
      if (userAnswer !== undefined && userAnswer >= 0 && userAnswer < question.options.length) {
        const selectedOption = question.options[userAnswer];
        const isCorrect = selectedOption && selectedOption.isCorrect;
        
        console.log(`Question ${i} result:`, {
          userAnswer,
          selectedOption,
          isCorrect
        });
        
        if (isCorrect) score++;
        
        processedAnswers.push({
          questionIndex: i,
          selectedOption: userAnswer,
          isCorrect
        });
      }
    }

    // Add attempt to quiz
    await quiz.addAttempt(req.userId, score, totalQuestions, processedAnswers);

    // Add to user's taken quizzes
    await User.findByIdAndUpdate(req.userId, {
      $push: {
        quizzesTaken: {
          quiz: quizId,
          score,
          totalQuestions,
          completedAt: new Date()
        }
      }
    });

    // Update quiz assignment status if it exists
    if (assignment) {
      assignment.status = 'completed';
      assignment.completedAt = new Date();
      assignment.score = score;
      assignment.totalQuestions = totalQuestions;
      assignment.timeTaken = timeTaken || 0;
      await assignment.save();

      // Send completion email to user and admin
      try {
        const user = await User.findById(req.userId);
        const adminUser = await User.findById(assignment.assignedBy);

        // Send email to user
        await sendQuizCompletionEmail(
          user.email,
          `${user.firstName} ${user.lastName}`,
          quiz.title,
          score,
          totalQuestions,
          `${adminUser.firstName} ${adminUser.lastName}`
        );

        // Send notification to admin
        await sendQuizCompletionEmail(
          adminUser.email,
          `${adminUser.firstName} ${adminUser.lastName}`,
          quiz.title,
          score,
          totalQuestions,
          `${user.firstName} ${user.lastName}`
        );
      } catch (emailError) {
        console.error('Failed to send completion emails:', emailError);
      }
    }

    res.json({
      success: true,
      message: 'Quiz submitted successfully',
      data: {
        score,
        totalQuestions,
        percentage: Math.round((score / totalQuestions) * 100),
        timeTaken: timeTaken || 0,
        answers: processedAnswers
      }
    });
  } catch (error) {
    console.error('Submit quiz error:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting quiz',
      error: error.message
    });
  }
};

// Get user's created quizzes
exports.getUserQuizzes = async (req, res) => {
  try {
    const quizzes = await Quiz.find({ creator: req.userId })
      .populate('creator', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: {
        quizzes
      }
    });
  } catch (error) {
    console.error('Get user quizzes error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user quizzes',
      error: error.message
    });
  }
};

// Update quiz
exports.updateQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    const updateData = req.body;

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    if (quiz.creator.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own quizzes'
      });
    }

    // Validate questions if provided
    if (updateData.questions) {
      for (let question of updateData.questions) {
        const correctOptions = question.options.filter(option => option.isCorrect);
        if (correctOptions.length !== 1) {
          return res.status(400).json({
            success: false,
            message: 'Each question must have exactly one correct answer'
          });
        }
      }
    }

    const updatedQuiz = await Quiz.findByIdAndUpdate(
      quizId,
      updateData,
      { new: true, runValidators: true }
    ).populate('creator', 'firstName lastName');

    res.json({
      success: true,
      message: 'Quiz updated successfully',
      data: {
        quiz: updatedQuiz
      }
    });
  } catch (error) {
    console.error('Update quiz error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating quiz',
      error: error.message
    });
  }
};

// Delete quiz
exports.deleteQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;

    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    if (quiz.creator.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own quizzes'
      });
    }

    await Quiz.findByIdAndDelete(quizId);

    // Remove from user's created quizzes
    await User.findByIdAndUpdate(req.userId, {
      $pull: { quizzesCreated: quizId }
    });

    res.json({
      success: true,
      message: 'Quiz deleted successfully'
    });
  } catch (error) {
    console.error('Delete quiz error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting quiz',
      error: error.message
    });
  }
};

// Assign quiz to users
exports.assignQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    const { emails } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one email address'
      });
    }

    // Validate quiz exists and user owns it
    const quiz = await Quiz.findById(quizId);
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    if (quiz.creator.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only assign your own quizzes'
      });
    }

    // Find users by email addresses
    const users = await User.find({ email: { $in: emails } });
    const foundEmails = users.map(user => user.email);
    const notFoundEmails = emails.filter(email => !foundEmails.includes(email));

    if (notFoundEmails.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Users not found: ${notFoundEmails.join(', ')}`,
        notFoundEmails
      });
    }

    // Get admin user info for email
    const adminUser = await User.findById(req.userId);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Create quiz assignments and send emails
    const assignments = [];
    const emailResults = [];
    
    for (const user of users) {
      // Check if assignment already exists
      const existingAssignment = await QuizAssignment.findOne({
        quiz: quizId,
        assignedTo: user._id
      });

      if (!existingAssignment) {
        const assignment = new QuizAssignment({
          quiz: quizId,
          assignedBy: req.userId,
          assignedTo: user._id,
          assignedAt: new Date(),
          status: 'pending'
        });
        await assignment.save();
        assignments.push(assignment);

        // Send email to user
        // try {
        //   const emailResult = await sendQuizAssignmentEmail(
        //     user.email,
        //     `${user.firstName} ${user.lastName}`,
        //     quiz.title,
        //     `${adminUser.firstName} ${adminUser.lastName}`,
        //     frontendUrl
        //   );
        //   emailResults.push({
        //     user: user.email,
        //     success: emailResult.success,
        //     error: emailResult.error
        //   });
        // } catch (emailError) {
        //   console.error(`Failed to send email to ${user.email}:`, emailError);
        //   emailResults.push({
        //     user: user.email,
        //     success: false,
        //     error: emailError.message
        //   });
        // }
      }
    }

    // Send summary email to admin
    try {
      await sendAssignmentNotificationToAdmin(
        adminUser.email,
        `${adminUser.firstName} ${adminUser.lastName}`,
        quiz.title,
        users
      );
    } catch (adminEmailError) {
      console.error('Failed to send admin notification:', adminEmailError);
    }

    res.json({
      success: true,
      message: `Quiz assigned successfully to ${assignments.length} user(s)`,
      data: {
        assignedCount: assignments.length,
        totalEmails: emails.length,
        notFoundEmails,
        emailResults
      }
    });
  } catch (error) {
    console.error('Assign quiz error:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning quiz',
      error: error.message
    });
  }
};

// Get user's assigned quizzes
exports.getAssignedQuizzes = async (req, res) => {
  try {
    const assignments = await QuizAssignment.find({ assignedTo: req.userId })
      .populate('quiz', 'title description timeLimit')
      .populate('assignedBy', 'firstName lastName')
      .sort({ assignedAt: -1 });

    res.json({
      success: true,
      data: {
        assignments
      }
    });
  } catch (error) {
    console.error('Get assigned quizzes error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching assigned quizzes',
      error: error.message
    });
  }
};

// Get assignment results
exports.getAssignmentResults = async (req, res) => {
  try {
    const assignments = await QuizAssignment.find({ 
      assignedTo: req.userId,
      status: 'completed'
    })
      .populate('quiz', 'title description')
      .populate('assignedBy', 'firstName lastName')
      .sort({ completedAt: -1 });

    const results = assignments.map(assignment => ({
      _id: assignment._id,
      quiz: assignment.quiz,
      assignedBy: assignment.assignedBy,
      score: assignment.score,
      totalQuestions: assignment.totalQuestions,
      timeTaken: assignment.timeTaken,
      completedAt: assignment.completedAt,
      assignedAt: assignment.assignedAt
    }));

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Get assignment results error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching assignment results',
      error: error.message
    });
  }
}; 

// Get assigned quiz by ID (for taking)
exports.getAssignedQuizForTaking = async (req, res) => {
  try {
    const { quizId } = req.params;

    // First check if this quiz is assigned to the user
    const assignment = await QuizAssignment.findOne({
      quiz: quizId,
      assignedTo: req.userId,
      status: 'pending'
    }).populate('quiz');

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Quiz assignment not found or already completed'
      });
    }

    // Check if quiz has expired
    if (assignment.expiresAt && new Date() > assignment.expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'This quiz has expired'
      });
    }

    // Get the quiz without correct answers
    const quiz = await Quiz.getQuizForTaking(quizId);
    
    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: 'Quiz not found'
      });
    }

    res.json({
      success: true,
      data: {
        quiz,
        assignment: {
          _id: assignment._id,
          expiresAt: assignment.expiresAt,
          assignedAt: assignment.assignedAt
        }
      }
    });
  } catch (error) {
    console.error('Get assigned quiz error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching assigned quiz',
      error: error.message
    });
  }
}; 