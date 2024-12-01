const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// Config for your email (Gmail example)
const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Endpoint to handle access requests
app.post('/submit-request', async (req, res) => {
  const { githubUsername, reason, repoName } = req.body;

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
      <p><strong>GitHub Username:</strong> ${githubUsername}</p>
      <p><strong>Reason for Access:</strong><br>${reason}</p>
      <div style="text-align: center; margin-top: 30px;">
        <a href="http://localhost:3001/accept-request?repo=${repoName}&username=${githubUsername}" 
           style="display: inline-block; background-color: #28a745; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 5px; margin: 5px; width: 150px; text-align: center;">
          Accept Request
        </a>
        <a href="http://localhost:3001/deny-request?username=${githubUsername}" 
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
});

// Accept Access Endpoint
app.get('/accept-request', async (req, res) => {
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
});

// Deny Access Endpoint
app.get('/deny-request', (req, res) => {
  const { username } = req.query;

  if (!username) {
    return res.status(400).send('Missing username.');
  }

  res.send(`Request from ${username} has been denied.`);
});

// Start the server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
