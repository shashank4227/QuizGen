import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { quizAPI } from '../services/api'

const AssignQuiz = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [quizzes, setQuizzes] = useState([])
  const [selectedQuiz, setSelectedQuiz] = useState('')
  const [userEmails, setUserEmails] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const fetchUserQuizzes = async () => {
      try {
        setLoading(true)
        const response = await quizAPI.getUserQuizzes()
        
        if (response.success) {
          console.log('Quiz API response:', response)
          setQuizzes(response.data.quizzes || [])
        } else {
          setError('Failed to load your quizzes')
        }
      } catch (error) {
        console.error('Error fetching quizzes:', error)
        setError('Failed to load your quizzes')
        setQuizzes([]) // Ensure quizzes is always an array
      } finally {
        setLoading(false)
      }
    }

    fetchUserQuizzes()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!selectedQuiz) {
      setError('Please select a quiz')
      return
    }
    
    if (!userEmails.trim()) {
      setError('Please enter at least one email address')
      return
    }

    // Parse email addresses
    const emails = userEmails
      .split(',')
      .map(email => email.trim())
      .filter(email => email.length > 0)

    if (emails.length === 0) {
      setError('Please enter valid email addresses')
      return
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const invalidEmails = emails.filter(email => !emailRegex.test(email))
    
    if (invalidEmails.length > 0) {
      setError(`Invalid email addresses: ${invalidEmails.join(', ')}`)
      return
    }

    try {
      setSubmitting(true)
      setError('')
      setSuccess('')

      const response = await quizAPI.assignQuiz(selectedQuiz, { emails })
      
             if (response.success) {
         let successMessage = `Quiz assigned successfully to ${emails.length} user(s)!`
         
         // Check email results if available
         if (response.data.emailResults) {
           const successfulEmails = response.data.emailResults.filter(r => r.success).length
           const failedEmails = response.data.emailResults.filter(r => !r.success).length
           
           if (successfulEmails > 0) {
             successMessage += ` Email notifications sent to ${successfulEmails} user(s).`
           }
           
           if (failedEmails > 0) {
             successMessage += ` Failed to send emails to ${failedEmails} user(s).`
           }
         }
         
         setSuccess(successMessage)
         setUserEmails('')
         setSelectedQuiz('')
       } else {
         setError(response.message || 'Failed to assign quiz')
       }
    } catch (error) {
      console.error('Error assigning quiz:', error)
      setError('Failed to assign quiz. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleQuizChange = (e) => {
    setSelectedQuiz(e.target.value)
    setError('')
    setSuccess('')
  }

  const handleEmailsChange = (e) => {
    setUserEmails(e.target.value)
    setError('')
    setSuccess('')
  }

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #f3f3f3',
            borderTop: '4px solid #007bff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 1rem'
          }}></div>
          <p style={{ color: '#666' }}>Loading your quizzes...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* Header */}
      <header style={{
        backgroundColor: 'white',
        padding: '1rem 2rem',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <h1 style={{ color: '#007bff', margin: 0, fontSize: '1.5rem' }}>QuizGen</h1>
          </Link>
          <nav style={{ display: 'flex', gap: '1rem' }}>
            <Link to="/dashboard" style={{ color: '#666', textDecoration: 'none' }}>
              Dashboard
            </Link>
            <Link to="/create-quiz" style={{ color: '#666', textDecoration: 'none' }}>
              Create Quiz
            </Link>
            <Link to="/assign-quiz" style={{ color: '#007bff', textDecoration: 'none', fontWeight: '500' }}>
              Assign Quiz
            </Link>
          </nav>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ color: '#666' }}>
            Welcome, {user?.firstName} {user?.lastName}
          </span>
        </div>
      </header>

      <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
        {/* Page Header */}
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '10px',
          marginBottom: '2rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ color: '#333', margin: '0 0 0.5rem 0' }}>
            Assign Quiz to Users 📧
          </h2>
          <p style={{ color: '#666', margin: 0 }}>
            Select one of your quizzes and assign it to specific users by their email addresses.
          </p>
        </div>

        {/* Assignment Form */}
        <div style={{
          backgroundColor: 'white',
          padding: '2rem',
          borderRadius: '10px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
                      {!Array.isArray(quizzes) || quizzes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <p style={{ color: '#666', marginBottom: '1rem' }}>
                You haven't created any quizzes yet.
              </p>
              <Link
                to="/create-quiz"
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#007bff',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '5px',
                  fontWeight: '500'
                }}
              >
                Create Your First Quiz
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {/* Quiz Selection */}
              <div style={{ marginBottom: '2rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  color: '#333',
                  fontWeight: '500'
                }}>
                  Select Quiz *
                </label>
                <select
                  value={selectedQuiz}
                  onChange={handleQuizChange}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #e0e0e0',
                    borderRadius: '5px',
                    fontSize: '1rem',
                    backgroundColor: 'white'
                  }}
                  required
                >
                  <option value="">Choose a quiz...</option>
                  {Array.isArray(quizzes) && quizzes.map((quiz) => (
                    <option key={quiz._id} value={quiz._id}>
                      {quiz.title} ({quiz.questions?.length || 0} questions)
                    </option>
                  ))}
                </select>
              </div>

              {/* Email Addresses */}
              <div style={{ marginBottom: '2rem' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  color: '#333',
                  fontWeight: '500'
                }}>
                  User Email Addresses *
                </label>
                <textarea
                  value={userEmails}
                  onChange={handleEmailsChange}
                  placeholder="Enter email addresses separated by commas (e.g., user1@example.com, user2@example.com)"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    border: '2px solid #e0e0e0',
                    borderRadius: '5px',
                    fontSize: '1rem',
                    minHeight: '100px',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                  required
                />
                <p style={{ color: '#666', fontSize: '0.875rem', margin: '0.5rem 0 0 0' }}>
                  You can enter multiple email addresses separated by commas.
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div style={{
                  backgroundColor: '#f8d7da',
                  color: '#721c24',
                  padding: '0.75rem',
                  borderRadius: '5px',
                  marginBottom: '1rem',
                  textAlign: 'center'
                }}>
                  {error}
                </div>
              )}

              {/* Success Message */}
              {success && (
                <div style={{
                  backgroundColor: '#d4edda',
                  color: '#155724',
                  padding: '0.75rem',
                  borderRadius: '5px',
                  marginBottom: '1rem',
                  textAlign: 'center'
                }}>
                  {success}
                </div>
              )}

              {/* Submit Button */}
              <div style={{
                display: 'flex',
                gap: '1rem',
                justifyContent: 'flex-end'
              }}>
                <Link
                  to="/dashboard"
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#6c757d',
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: '5px',
                    fontWeight: '500'
                  }}
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: submitting ? '#6c757d' : '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    fontSize: '1rem',
                    fontWeight: '500',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.7 : 1
                  }}
                >
                  {submitting ? 'Assigning...' : 'Assign Quiz'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Instructions */}
        <div style={{
          backgroundColor: 'white',
          padding: '1.5rem',
          borderRadius: '10px',
          marginTop: '2rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ color: '#333', margin: '0 0 1rem 0' }}>How Quiz Assignment Works</h3>
          <ul style={{ color: '#666', margin: 0, paddingLeft: '1.5rem' }}>
            {/* <li style={{ marginBottom: '0.5rem' }}>
              Users will receive an email notification about the assigned quiz
            </li> */}
            <li style={{ marginBottom: '0.5rem' }}>
              They can access the quiz through a unique link sent to their email
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              You can track their progress and results in your dashboard
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              Users must have an account with the email address you provide
            </li>
          </ul>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default AssignQuiz 