const express = require('express');
const morgan = require('morgan');
const nodemailer = require('nodemailer');
const cors = require('cors');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const expressSanitizer = require('express-sanitizer');
const { body, validationResult, query } = require('express-validator');

require('dotenv').config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3000', // Frontend (local dev)
      'http://localhost:3001', // Backend (local dev)
      process.config.FRONTEND_URL_1,
      process.config.FRONTEND_URL_2,
      process.config.FRONTEND_URL_3,
      process.config.BACKEND_URL,
    ];
    // Allow requests from these origins or non-origin requests (e.g., server-to-server)
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: 'GET,POST,OPTIONS', // Allow only necessary HTTP methods
  credentials: true, // Allow cookies or Authorization headers
  allowedHeaders: 'Content-Type,Authorization', // Allow specific headers
};

// app.options('*', cors(corsOptions));
app.use(cors());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 100 requests per window
});

app.use(limiter);
app.use(expressSanitizer());
app.use(morgan('combined'));

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Endpoint to handle access requests
app.post(
  '/submit-request',
  [
    // Validate 'githubUsername' to ensure it's alphanumeric
    body('githubUsername')
      .isAlphanumeric()
      .withMessage('Invalid GitHub username'),
    // Validate 'reason' to ensure it has at least 5 characters
    body('reason')
      .isLength({ min: 5 })
      .withMessage('Reason must be at least 5 characters long'),
    // Validate 'requestorName' to ensure it's not empty
    body('requesterName').notEmpty().withMessage('Name is required'),
    // Validate 'repoName' to ensure it follows GitHub repository naming conventions
    body('repoName')
      .matches(/^[a-zA-Z0-9-_]+$/)
      .withMessage('Invalid repository name'),
  ],
  async (req, res) => {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Return errors if validation fails
      return res.status(400).json({ errors: errors.array() });
    }

    const { githubUsername, reason, repoName, requesterName } = req.body;

    if (!githubUsername || !reason || !repoName) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.TO_EMAIL,
      subject: `Access Request for Repository: ${repoName}`,
      html: `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; padding: 20px;">
      <h2 style="text-align: center; color: #007BFF;">New Private Repository Access Request</h2>
      <p>You have a new request for access to the repository: <strong style="color: #007BFF;">${repoName}</strong>.</p>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
      <p><strong>Name of Requester:</strong> ${requesterName}</p>
      <p><strong>GitHub Username:</strong> ${githubUsername}</p>
      <p><strong>Reason for Access:</strong><br>${reason}</p>
      <div style="text-align: center; margin-top: 30px;">
        <a href="${process.env.BACKEND_URL}/accept-request?repo=${repoName}&username=${githubUsername}" 
           style="display: inline-block; background-color: #28a745; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 5px; margin: 5px; width: 150px; text-align: center;">
          Accept Request
        </a>
        <a href="${process.env.BACKEND_URL}/deny-request?username=${githubUsername}" 
           style="display: inline-block; background-color: #dc3545; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 5px; margin: 5px; width: 150px; text-align: center;">
          Deny Request
        </a>
      </div>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
      <p style="font-size: 0.9em; color: #666; text-align: center;">This email was generated automatically. If you have any questions, please contact the administrator.</p>
    </div>
  `,
    };

    try {
      await transporter.sendMail(mailOptions);
      res.status(200).json({ message: 'Request submitted successfully!' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error sending email.' });
    }
  }
);

// Accept Access Endpoint
app.get(
  '/accept-request',
  [
    // Validate the 'repo' query parameter
    query('repo')
      .matches(/^[a-zA-Z0-9-_]+$/)
      .withMessage('Invalid repository name'),
    // Validate the 'username' query parameter
    query('username').isAlphanumeric().withMessage('Invalid GitHub username'),
  ],
  async (req, res) => {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { repo, username } = req.query;

    if (!repo || !username) {
      return res.status(400).send('Missing repository name or username.');
    }

    try {
      // Use GitHub API to add a collaborator
      const response = await axios.put(
        `https://api.github.com/repos/${process.env.OWNER}/${repo}/collaborators/${username}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      );

      res.send(`Successfully added ${username} to ${repo}.`);
    } catch (error) {
      if (error.response) {
        // The request was made, and the server responded with an error status code
        console.error('Response error:', error.response.status);
        console.error('Error data:', error.response.data);
      } else if (error.request) {
        // The request was made but no response was received
        console.error('No response received:', error.request);
      } else {
        // Something else happened while setting up the request
        console.error('Error setting up the request:', error.message);
      }
    }
  }
);

// Deny Access Endpoint
app.get(
  '/deny-request',
  [
    // Validate the 'username' query parameter
    query('username').isAlphanumeric().withMessage('Invalid GitHub username'),
  ],
  (req, res) => {
    // Check validation results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { username } = req.query;

    if (!username) {
      return res.status(400).send('Missing username.');
    }

    res.send(`Request from ${username} has been denied.`);
  }
);

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
