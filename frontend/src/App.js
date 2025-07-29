import React, { useState, useRef } from "react";
import axios from "axios";
import { Bar, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";

// Register all necessary Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

function App() {
  // State variables for user authentication and application data
  const [user, setUser] = useState({ username: "", password: "" });
  const [loggedIn, setLoggedIn] = useState(false);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showValidate, setShowValidate] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [statusCounts, setStatusCounts] = useState({});
  const [allRejectionData, setAllRejectionData] = useState(null); // Renamed to clearly indicate all rejection reasons
  // Single state for the filter-based graph (now correctly grouped)
  const [filterData, setFilterData] = useState(null);

  // NEW STATE: Control visibility of the landing page
  const [showLandingPage, setShowLandingPage] = useState(true);

  // Refs for chart canvases to enable image download
  const validationStatusChartRef = useRef(null);
  const filterChartRef = useRef(null);
  const allRejectionChartRef = useRef(null);

  // Function to handle user login
  const login = async () => {
    try {
      // Make a POST request to the login endpoint
      await axios.post("http://localhost:5000/login", user, {
        withCredentials: true, // Send cookies with the request
      });
      setLoggedIn(true); // Set loggedIn to true on successful login
      setShowLandingPage(false); // Ensure landing page is hidden after login
    } catch (error) {
      // Display a custom message box for invalid credentials
      // Using a simple div for message instead of alert()
      const messageBox = document.createElement('div');
      messageBox.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: #fef2f2;
        border: 1px solid #ef4444;
        color: #dc2626;
        padding: 1.5rem;
        border-radius: 0.5rem;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 1000;
        font-family: sans-serif;
        font-size: 1rem;
        text-align: center;
      `;
      messageBox.innerHTML = `
        <p style="margin-bottom: 1rem; font-weight: bold;">Invalid Credentials</p>
        <p>Please check your username and password and try again.</p>
        <button style="
          margin-top: 1rem;
          padding: 0.5rem 1rem;
          background-color: #dc2626;
          color: white;
          border: none;
          border-radius: 0.25rem;
          cursor: pointer;
        " onclick="this.parentNode.remove()">OK</button>
      `;
      document.body.appendChild(messageBox);
    }
  };

  // Function to handle user logout
  const logout = async () => {
    try {
      await axios.post("http://localhost:5000/logout", {}, {
        withCredentials: true,
      });
      setLoggedIn(false);
      setShowLandingPage(true); // Go back to landing page after logout
      // Clear any sensitive data or reset state as needed
      setFile(null);
      setLoading(false);
      setShowValidate(false);
      setShowDownload(false);
      setStatusCounts({});
      setAllRejectionData(null);
      setFilterData(null);
    } catch (error) {
      console.error("Logout failed:", error);
      // Even if logout fails on server, client-side state should be reset
      setLoggedIn(false);
      setShowLandingPage(true);
    }
  };

  // Function to handle file selection for upload
  const handleUpload = (e) => {
    setFile(e.target.files[0]); // Set the selected file
    setShowValidate(true); // Show the validate button
    setShowDownload(false); // Hide the download button initially
    // Reset chart data when a new file is uploaded
    setStatusCounts({});
    setAllRejectionData(null); // Reset all rejection data
    setFilterData(null); // Reset filter data
  };

  // Function to handle the validation process
  const handleValidate = async () => {
    if (!file) return; // Do nothing if no file is selected
    setLoading(true); // Show loading indicator
    const formData = new FormData();
    formData.append("file", file); // Append the file to form data

    try {
      // Make a POST request to the upload endpoint for validation
         const res = await axios.post("http://localhost:5000/upload", formData, {
        withCredentials: true, // Send cookies with the request
      });

      setShowDownload(true); // Show download button after validation
      setStatusCounts(res.data.status_summary); // Set status counts (Accepted/Rejected)

      // Prepare data for "All Rejection Reasons Breakdown" bar chart
      // Ensure all reasons are included, not just top 10
      if (res.data.summary) {
        const allReasons = Object.entries(res.data.summary).sort(([, a], [, b]) => b - a);
        setAllRejectionData({
          labels: allReasons.map(([reason]) => reason),
          datasets: [
            {
              label: "Count",
              data: allReasons.map(([, count]) => count),
              backgroundColor: "#ef4444", // Red
              borderColor: "#b91c1c", // Darker Red
              borderWidth: 1,
              borderRadius: 4,
            },
          ],
        });
      } else {
        setAllRejectionData(null);
      }

      // Prepare data for Filter-wise Accepted vs Rejected chart (now correctly Grouped)
      if (res.data.filter_summary && res.data.filter_summary.length > 0) {
        const categories = res.data.filter_summary.map((f) => f.Category);
        const acceptedCounts = res.data.filter_summary.map((f) => f.Accepted || 0);
        const rejectedCounts = res.data.filter_summary.map((f) => f.Rejected || 0);

        setFilterData({
          labels: categories,
          datasets: [
            {
              label: "Accepted",
              data: acceptedCounts,
              backgroundColor: "#22c55e", // Green
              borderRadius: 4,
              minBarLength: 2, // Ensure a minimum visible length for zero values
              categoryPercentage: 0.8, // Controls the width of the group of bars for each category
              barPercentage: 0.8, // Controls the width of each individual bar within the group
            },
            {
              label: "Rejected",
              data: rejectedCounts,
              backgroundColor: "#ef4444", // Red
              borderRadius: 4,
              minBarLength: 2, // Ensure a minimum visible length for zero values
              categoryPercentage: 0.8,
              barPercentage: 0.8,
            },
          ],
        });
      } else {
        setFilterData(null); // Set to null if no data or empty array
      }

    } catch (err) {
      // Display a custom message box for validation failure
      const messageBox = document.createElement('div');
      messageBox.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: #fef2f2;
        border: 1px solid #ef4444;
        color: #dc2626;
        padding: 1.5rem;
        border-radius: 0.5rem;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 1000;
        font-family: sans-serif;
        font-size: 1rem;
        text-align: center;
      `;
      messageBox.innerHTML = `
        <p style="margin-bottom: 1rem; font-weight: bold;">Validation Failed</p>
        <p>Please ensure your file is correctly formatted or the server is running.</p>
        <button style="
          margin-top: 1rem;
          padding: 0.5rem 1rem;
          background-color: #dc2626;
          color: white;
          border: none;
          border-radius: 0.25rem;
          cursor: pointer;
        " onclick="this.parentNode.remove()">OK</button>
      `;
      document.body.appendChild(messageBox);
      console.error("Validation error:", err);
    } finally {
      setLoading(false); // Hide loading indicator
    }
  };

  // Function to handle downloading all charts as images
  const handleDownloadGraphs = () => {
    const chartsToDownload = [
      { ref: validationStatusChartRef, filename: "validation_status_chart.png", title: "Validation Status" },
      { ref: allRejectionChartRef, filename: "all_rejection_reasons_chart.png", title: "All Rejection Reasons Breakdown" },
      { ref: filterChartRef, filename: "filter_wise_chart.png", title: "Filter-wise Accepted vs Rejected" },
    ];

    chartsToDownload.forEach(chartInfo => {
      const chartInstance = chartInfo.ref.current;
      if (chartInstance) {
        // Chart.js provides a getBase64Image() method or can use toDataURL() directly on the canvas element
        const canvas = chartInstance.canvas;
        if (canvas) {
          const image = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.href = image;
          link.download = chartInfo.filename;
          document.body.appendChild(link); // Append to body to make it clickable
          link.click();
          document.body.removeChild(link); // Clean up
        }
      }
    });
  };


  // Data for "Validation Status" Doughnut chart
  const validationStatusData = {
    labels: ["Accepted", "Rejected"],
    datasets: [
      {
        data: [statusCounts.Accepted || 0, statusCounts.Rejected || 0],
        backgroundColor: ["#22c55e", "#ef4444"], // Green for Accepted, Red for Rejected
        hoverOffset: 4,
      },
    ],
  };

  // Options for Doughnut chart to display percentages
  const validationStatusOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          font: {
            size: 14,
          },
          color: '#e0e7ff', // Set legend color to light
        },
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const label = context.label || '';
            const value = context.raw || 0;
            const total = context.dataset.data.reduce((acc, current) => acc + current, 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(2) : 0;
            return `${label}: ${value} (${percentage}%)`;
          }
        },
        titleFont: {
          size: 16,
        },
        bodyFont: {
          size: 14,
        },
      }
    }
  };

  // NEW: Render the landing page if showLandingPage is true
  if (showLandingPage) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at center, #0a1128 0%, #03081e 100%)', // Dark blue radial gradient
        fontFamily: 'Inter, sans-serif',
        padding: '2rem',
        color: '#e0e7ff', // Light text color for contrast
        overflow: 'hidden', // Prevent scrollbars if content slightly overflows
        position: 'relative' // For potential absolute positioned elements
      }}>
        {/* Absolute positioned Login button */}
        <button
          onClick={() => setShowLandingPage(false)}
          style={{
            position: 'absolute',
            top: '2rem',
            right: '2rem',
            backgroundColor: 'rgba(59, 130, 246, 0.1)', // Subtle blue background
            color: '#7dd3fc', // Light blue text
            padding: '0.75rem 1.5rem',
            borderRadius: '0.5rem',
            border: '1px solid rgba(59, 130, 246, 0.4)', // Blue border
            fontWeight: '600',
            fontSize: '1rem',
            cursor: 'pointer',
            backdropFilter: 'blur(10px)', // Glassmorphism effect
            transition: 'all 0.3s ease-in-out',
            zIndex: 10 // Ensure it's above other elements
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
            e.currentTarget.style.boxShadow = '0 0 20px rgba(59, 130, 246, 0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          Log In
        </button>


        {/* Abstract glowing elements (mimicking hex patterns, simple circles for inline style) */}
        <div style={{
          position: 'absolute', top: '10%', left: '10%', width: '100px', height: '100px',
          backgroundColor: 'rgba(59, 130, 246, 0.1)', // blue-500 with transparency
          borderRadius: '50%', filter: 'blur(50px)', zIndex: 0
        }}></div>
        <div style={{
          position: 'absolute', bottom: '15%', right: '5%', width: '150px', height: '150px',
          backgroundColor: 'rgba(34, 197, 94, 0.1)', // green-500 with transparency
          borderRadius: '50%', filter: 'blur(70px)', zIndex: 0
        }}></div>
        <div style={{
          position: 'absolute', top: '50%', left: '30%', width: '80px', height: '80px',
          backgroundColor: 'rgba(168, 85, 247, 0.1)', // purple-500 with transparency
          borderRadius: '50%', filter: 'blur(40px)', zIndex: 0
        }}></div>

        {/* NEW: Decorative graph elements */}
        {/* Abstract Line Graph */}
        <div style={{
          position: 'absolute',
          bottom: '5%',
          left: '20%',
          width: '180px',
          height: '5px',
          background: 'linear-gradient(to right, rgba(125, 211, 252, 0.3), rgba(59, 130, 246, 0.6))',
          borderRadius: '5px',
          transform: 'rotate(-20deg)',
          filter: 'blur(3px)',
          zIndex: 0,
        }}></div>
        <div style={{
          position: 'absolute',
          bottom: '8%',
          left: '22%',
          width: '180px',
          height: '5px',
          background: 'linear-gradient(to right, rgba(165, 180, 252, 0.3), rgba(129, 140, 248, 0.6))',
          borderRadius: '5px',
          transform: 'rotate(15deg)',
          filter: 'blur(3px)',
          zIndex: 0,
        }}></div>

        {/* Abstract Bar Graph (set of div bars) */}
        <div style={{
          position: 'absolute',
          top: '20%',
          right: '20%',
          display: 'flex',
          gap: '5px',
          filter: 'blur(2px)',
          zIndex: 0,
        }}>
          <div style={{ width: '15px', height: '60px', backgroundColor: 'rgba(34, 197, 94, 0.4)', borderRadius: '3px' }}></div>
          <div style={{ width: '15px', height: '90px', backgroundColor: 'rgba(34, 197, 94, 0.5)', borderRadius: '3px' }}></div>
          <div style={{ width: '15px', height: '75px', backgroundColor: 'rgba(34, 197, 94, 0.45)', borderRadius: '3px' }}></div>
          <div style={{ width: '15px', height: '100px', backgroundColor: 'rgba(34, 197, 94, 0.55)', borderRadius: '3px' }}></div>
        </div>

        {/* Abstract Radial/Pie Segment */}
        <div style={{
          position: 'absolute',
          top: '60%',
          right: '15%',
          width: '100px',
          height: '100px',
          borderRadius: '50%',
          background: 'conic-gradient(from 0deg at 50% 50%, rgba(234, 179, 8, 0.4) 0deg 90deg, rgba(234, 179, 8, 0.2) 90deg 180deg, rgba(234, 179, 8, 0.1) 180deg 360deg)',
          filter: 'blur(5px)',
          zIndex: 0,
          transform: 'rotate(30deg)'
        }}></div>


        {/* Main Content Area - Split into left for text and right for features */}
        <div style={{
          display: 'flex',
          flexDirection: window.innerWidth < 1024 ? 'column' : 'row', // Stack vertically on smaller screens
          gap: '2rem', // Gap between the two columns
          width: '100%',
          maxWidth: '80rem', // Overall max width for the content area
          alignItems: window.innerWidth < 1024 ? 'center' : 'flex-start', // Center items when stacked
          zIndex: 1 // Ensure content is above background elements
        }}>
          {/* Left Column: Title, Description, Button */}
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.05)', // Semi-transparent white background
            padding: '3rem',
            borderRadius: '0.75rem',
            boxShadow: '0 0 40px rgba(59, 130, 246, 0.3), 0 0 80px rgba(59, 130, 246, 0.2)', // Blue glow effect
            width: window.innerWidth < 1024 ? '100%' : '60%', // Take full width on small, 60% on large
            textAlign: window.innerWidth < 1024 ? 'center' : 'left', // Center text on small screens
            transition: 'transform 0.3s ease-in-out',
            backdropFilter: 'blur(5px)', // Subtle blur for glassmorphism
            marginBottom: window.innerWidth < 1024 ? '2rem' : '0' // Margin for separation when stacked
          }}>
            <h1 style={{
              fontSize: window.innerWidth < 768 ? '3rem' : '4.5rem', // Adjust font size for responsiveness
              fontWeight: '800',
              marginBottom: '1.5rem',
              color: '#7dd3fc', // Light blue color for the title
              lineHeight: '1.2',
              textShadow: '0 0 15px rgba(125, 211, 252, 0.7)' // Glowing text effect
            }}>
              AI Excel Validator
            </h1>
            <p style={{
              fontSize: window.innerWidth < 768 ? '1.15rem' : '1.35rem',
              color: '#a5b4fc', // Lighter blue for description
              marginBottom: '1.5rem',
              lineHeight: '1.7',
              opacity: 0.9
            }}>
              Unlock the full potential of your data with our intelligent validation solution.
              Designed for precision and efficiency, our AI Excel Validator ensures your spreadsheets
              are clean, consistent, and ready for analysis.
            </p>
            <button
              onClick={() => setShowLandingPage(false)} // Proceed to login page
              style={{
                width: '100%',
                backgroundColor: '#3b82f6', // bg-blue-500
                color: '#fff',
                padding: '1.2rem',
                borderRadius: '0.5rem',
                fontWeight: '700',
                fontSize: '1.4rem',
                cursor: 'pointer',
                border: 'none',
                boxShadow: '0 0 20px rgba(59, 130, 246, 0.5), inset 0 0 10px rgba(255, 255, 255, 0.2)', // Stronger glow
                transition: 'background-color 0.3s ease-in-out, transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#2563eb'; // Darker blue on hover
                e.currentTarget.style.transform = 'translateY(-0.35rem) scale(1.02)'; // Lift and slightly enlarge
                e.currentTarget.style.boxShadow = '0 0 30px rgba(59, 130, 246, 0.7), inset 0 0 15px rgba(255, 255, 255, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#3b82f6';
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(59, 130, 246, 0.5), inset 0 0 10px rgba(255, 255, 255, 0.2)';
              }}
            >
              Get Started with Validation
            </button>
          </div>

          {/* Right Column: Features Box */}
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.05)', // Semi-transparent white background
            padding: '2.5rem', // Slightly less padding for a tighter look
            borderRadius: '0.75rem',
            boxShadow: '0 0 30px rgba(168, 85, 247, 0.3), 0 0 60px rgba(168, 85, 247, 0.2)', // Purple glow for features
            width: window.innerWidth < 1024 ? '100%' : '40%', // Take full width on small, 40% on large
            textAlign: 'left',
            backdropFilter: 'blur(5px)',
            border: '1px solid rgba(255, 255, 255, 0.1)', // Subtle border
            display: 'flex', // Use flex to center content vertically if needed
            flexDirection: 'column',
            justifyContent: 'center'
          }}>
            <h3 style={{
              fontSize: '1.75rem', // text-2xl
              fontWeight: '700',
              marginBottom: '1.5rem',
              color: '#d8b4fe', // Light purple for feature title
              textShadow: '0 0 10px rgba(216, 180, 254, 0.5)',
              textAlign: 'center' // Center the feature title
            }}>Key Features</h3>
            <ul style={{ listStyleType: 'none', padding: '0', margin: '0' }}> {/* Removed default list styling */}
              <li style={{ marginBottom: '1rem', display: 'flex', alignItems: 'flex-start' }}>
                <span style={{ color: '#818cf8', fontSize: '1.5rem', marginRight: '0.75rem' }}>✨</span> {/* Icon */}
                <div>
                  <strong style={{ color: '#e0e7ff', fontSize: '1.1rem' }}>Smart Data Type Detection:</strong>
                  <p style={{ color: '#c4b5fd', fontSize: '0.95rem', opacity: 0.8 }}>Automatically identifies and flags incorrect data types across columns.</p>
                </div>
              </li>
              <li style={{ marginBottom: '1rem', display: 'flex', alignItems: 'flex-start' }}>
                <span style={{ color: '#818cf8', fontSize: '1.5rem', marginRight: '0.75rem' }}>✅</span>
                <div>
                  <strong style={{ color: '#e0e7ff', fontSize: '1.1rem' }}>Consistency Checks:</strong>
                  <p style={{ color: '#c4b5fd', fontSize: '0.95rem', opacity: 0.8 }}>Pinpoints inconsistencies in formatting, naming conventions, and data entries.</p>
                </div>
              </li>
              <li style={{ marginBottom: '1rem', display: 'flex', alignItems: 'flex-start' }}>
                <span style={{ color: '#818cf8', fontSize: '1.5rem', marginRight: '0.75rem' }}>⚙️</span>
                <div>
                  <strong style={{ color: '#e0e7ff', fontSize: '1.1rem' }}>Customizable Rules:</strong>
                  <p style={{ color: '#c4b5fd', fontSize: '0.95rem', opacity: 0.8 }}>Define your own validation rules specific to your business needs and data standards.</p>
                </div>
              </li>
              <li style={{ marginBottom: '1rem', display: 'flex', alignItems: 'flex-start' }}>
                <span style={{ color: '#818cf8', fontSize: '1.5rem', marginRight: '0.75rem' }}>📈</span>
                <div>
                  <strong style={{ color: '#e0e7ff', fontSize: '1.1rem' }}>Detailed Error Reporting:</strong>
                  <p style={{ color: '#c4b5fd', fontSize: '0.95rem', opacity: 0.8 }}>Get comprehensive reports on rejected entries with clear reasons for easy rectification.</p>
                </div>
              </li>
              <li style={{ display: 'flex', alignItems: 'flex-start' }}>
                <span style={{ color: '#818cf8', fontSize: '1.5rem', marginRight: '0.75rem' }}>📊</span>
                <div>
                  <strong style={{ color: '#e0e7ff', fontSize: '1.1rem' }}>Seamless CSV/Excel Support:</strong>
                  <p style={{ color: '#c4b5fd', fontSize: '0.95rem', opacity: 0.8 }}>Works flawlessly with both .csv and .xlsx file formats.</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }


  // Render the login page if not logged in (after landing page is dismissed)
  if (!loggedIn) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at center, #0a1128 0%, #03081e 100%)', // Consistent dark background
        fontFamily: 'Inter, sans-serif',
        color: '#e0e7ff', // Light text color
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Absolute positioned Login button */}
        <button
          onClick={() => setShowLandingPage(true)} // Go back to landing page
          style={{
            position: 'absolute',
            top: '2rem',
            right: '2rem',
            backgroundColor: 'rgba(59, 130, 246, 0.1)', // Subtle blue background
            color: '#7dd3fc', // Light blue text
            padding: '0.75rem 1.5rem',
            borderRadius: '0.5rem',
            border: '1px solid rgba(59, 130, 246, 0.4)', // Blue border
            fontWeight: '600',
            fontSize: '1rem',
            cursor: 'pointer',
            backdropFilter: 'blur(10px)', // Glassmorphism effect
            transition: 'all 0.3s ease-in-out',
            zIndex: 10 // Ensure it's above other elements
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
            e.currentTarget.style.boxShadow = '0 0 20px rgba(59, 130, 246, 0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          Back to Home
        </button>

        {/* Abstract glowing elements for login page background */}
        <div style={{
          position: 'absolute', top: '5%', right: '15%', width: '120px', height: '120px',
          backgroundColor: 'rgba(234, 179, 8, 0.08)', // yellow-500 with high transparency
          borderRadius: '50%', filter: 'blur(60px)', zIndex: 0
        }}></div>
        <div style={{
          position: 'absolute', bottom: '10%', left: '10%', width: '150px', height: '150px',
          backgroundColor: 'rgba(129, 140, 248, 0.08)', // indigo-400 with high transparency
          borderRadius: '50%', filter: 'blur(80px)', zIndex: 0
        }}></div>
        <div style={{
          position: 'absolute', top: '30%', left: '5%', width: '90px', height: '90px',
          backgroundColor: 'rgba(59, 130, 246, 0.08)', // blue-500 with high transparency
          borderRadius: '50%', filter: 'blur(50px)', zIndex: 0
        }}></div>
         <div style={{
          position: 'absolute', bottom: '25%', right: '20%', width: '100px', height: '100px',
          backgroundColor: 'rgba(34, 197, 94, 0.08)', // green-500 with high transparency
          borderRadius: '50%', filter: 'blur(70px)', zIndex: 0
        }}></div>

        <div style={{
          backgroundColor: 'rgba(0, 0, 0, 0.2)', // More transparent dark background for the form
          padding: '2.5rem',
          borderRadius: '0.75rem',
          boxShadow: '0 0 40px rgba(59, 130, 246, 0.4), 0 0 80px rgba(59, 130, 246, 0.3)', // Stronger blue glow
          width: '100%',
          maxWidth: '28rem',
          transition: 'transform 0.3s ease-in-out',
          zIndex: 1,
          backdropFilter: 'blur(8px)', // Increased blur for stronger glassmorphism
          border: '1px solid rgba(255, 255, 255, 0.08)' // Even subtler light border
        }}>
          <h2 style={{
            fontSize: '2.5rem',
            fontWeight: '800',
            textAlign: 'center',
            marginBottom: '2rem',
            color: '#a5b4fc', // Light blue text for title
            textShadow: '0 0 12px rgba(165, 180, 252, 0.6)' // Glow for title
          }}>Welcome Back!</h2> {/* Changed text for variety */}
          <p style={{
            textAlign: 'center',
            color: '#c4b5fd', // Lighter blue for description
            marginBottom: '1.5rem',
            opacity: 0.85
          }}>Please log in to access the AI Excel Validator.</p>
          <input
            type="text"
            placeholder="Username"
            style={{
              width: '100%',
              padding: '1rem',
              marginBottom: '1rem',
              background: 'rgba(0, 0, 0, 0.15)', // More transparent input background
              border: '1px solid rgba(255, 255, 255, 0.15)', // Subtler border
              borderRadius: '0.5rem',
              outline: 'none',
              fontSize: '1.125rem',
              color: '#fff', // White text
              transition: 'all 0.2s ease-in-out',
              boxSizing: 'border-box',
              textShadow: '0 0 5px rgba(255,255,255,0.3)' // Subtle text glow
            }}
            onFocus={(e) => {
              e.target.style.boxShadow = '0 0 0 4px rgba(96, 165, 250, 0.4), 0 0 20px rgba(96, 165, 250, 0.7)'; // Stronger blue glow on focus
              e.target.style.borderColor = '#93c5fd';
            }}
            onBlur={(e) => {
              e.target.style.boxShadow = 'none';
              e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            }}
            onChange={(e) => setUser({ ...user, username: e.target.value })}
          />
          <input
            type="password"
            placeholder="Password"
            style={{
              width: '100%',
              padding: '1rem',
              marginBottom: '1.5rem',
              background: 'rgba(0, 0, 0, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '0.5rem',
              outline: 'none',
              fontSize: '1.125rem',
              color: '#fff',
              transition: 'all 0.2s ease-in-out',
              boxSizing: 'border-box',
              textShadow: '0 0 5px rgba(255,255,255,0.3)'
            }}
            onFocus={(e) => {
              e.target.style.boxShadow = '0 0 0 4px rgba(96, 165, 250, 0.4), 0 0 20px rgba(96, 165, 250, 0.7)';
              e.target.style.borderColor = '#93c5fd';
            }}
            onBlur={(e) => {
              e.target.style.boxShadow = 'none';
              e.target.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            }}
            onChange={(e) => setUser({ ...user, password: e.target.value })}
          />
          <button
            onClick={login}
            style={{
              width: '100%',
              backgroundColor: '#4f46e5', // A slightly different purple-blue shade (indigo-600)
              color: '#e0e7ff', // Off-white for contrast
              padding: '1.1rem', // Slightly more padding
              borderRadius: '0.5rem',
              fontWeight: '700',
              fontSize: '1.3rem', // Slightly larger font
              cursor: 'pointer',
              border: 'none',
              boxShadow: '0 0 25px rgba(79, 70, 229, 0.6), inset 0 0 15px rgba(255, 255, 255, 0.2)', // Stronger purple glow
              transition: 'background-color 0.3s ease-in-out, transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#3730a3'; // Darker indigo on hover
              e.currentTarget.style.transform = 'translateY(-0.35rem)';
              e.currentTarget.style.boxShadow = '0 0 35px rgba(79, 70, 229, 0.8), inset 0 0 20px rgba(255, 255, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#4f46e5';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 0 25px rgba(79, 70, 229, 0.6), inset 0 0 15px rgba(255, 255, 255, 0.2)';
            }}
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  // Render the main application once logged in
  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at center, #0a1128 0%, #03081e 100%)', // Dark blue radial gradient
      padding: '1.5rem', // p-6
      fontFamily: 'Inter, sans-serif', // Changed font to Inter
      color: '#e0e7ff', // Light text color for contrast with dark theme
      position: 'relative', // Needed for absolute positioning of logout button
      overflow: 'hidden' // Ensure hidden for decorative elements
    }}>
      {/* Abstract glowing elements for main app background */}
      <div style={{
        position: 'absolute', top: '5%', left: '80%', width: '100px', height: '100px',
        backgroundColor: 'rgba(59, 130, 246, 0.1)', // blue-500 with transparency
        borderRadius: '50%', filter: 'blur(50px)', zIndex: 0
      }}></div>
      <div style={{
        position: 'absolute', bottom: '10%', right: '75%', width: '150px', height: '150px',
        backgroundColor: 'rgba(34, 197, 94, 0.1)', // green-500 with transparency
        borderRadius: '50%', filter: 'blur(70px)', zIndex: 0
      }}></div>
      <div style={{
        position: 'absolute', top: '60%', left: '5%', width: '80px', height: '80px',
        backgroundColor: 'rgba(168, 85, 247, 0.1)', // purple-500 with transparency
        borderRadius: '50%', filter: 'blur(40px)', zIndex: 0
      }}></div>
      {/* More decorative graphs for the main app */}
      <div style={{
          position: 'absolute',
          top: '15%',
          left: '10%',
          width: '150px',
          height: '5px',
          background: 'linear-gradient(to right, rgba(125, 211, 252, 0.2), rgba(59, 130, 246, 0.5))',
          borderRadius: '5px',
          transform: 'rotate(25deg)',
          filter: 'blur(3px)',
          zIndex: 0,
        }}></div>
      <div style={{
        position: 'absolute',
        bottom: '20%',
        right: '10%',
        display: 'flex',
        gap: '5px',
        filter: 'blur(2px)',
        zIndex: 0,
      }}>
        <div style={{ width: '12px', height: '50px', backgroundColor: 'rgba(234, 179, 8, 0.3)', borderRadius: '3px' }}></div>
        <div style={{ width: '12px', height: '80px', backgroundColor: 'rgba(234, 179, 8, 0.4)', borderRadius: '3px' }}></div>
        <div style={{ width: '12px', height: '65px', backgroundColor: 'rgba(234, 179, 8, 0.35)', borderRadius: '3px' }}></div>
      </div>


      {/* Absolute positioned Logout button */}
      {loggedIn && (
        <button
          onClick={logout}
          style={{
            position: 'absolute',
            top: '1.5rem',
            right: '1.5rem',
            backgroundColor: 'rgba(239, 68, 68, 0.2)', // Red background for logout, with transparency
            color: '#f87171', // Light red text
            padding: '0.6rem 1.2rem',
            borderRadius: '0.5rem',
            border: '1px solid rgba(239, 68, 68, 0.4)', // Red border
            fontWeight: '600',
            fontSize: '1rem',
            cursor: 'pointer',
            backdropFilter: 'blur(10px)', // Glassmorphism
            boxShadow: '0 0 15px rgba(239, 68, 68, 0.3)',
            transition: 'all 0.3s ease-in-out',
            zIndex: 10
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.3)';
            e.currentTarget.style.boxShadow = '0 0 25px rgba(239, 68, 68, 0.5)';
            e.currentTarget.style.transform = 'translateY(-0.1rem)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.2)';
            e.currentTarget.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.3)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          Logout
        </button>
      )}
      <div style={{
        maxWidth: '80rem', // max-w-7xl
        margin: '0 auto', // mx-auto
        backgroundColor: 'rgba(255, 255, 255, 0.05)', // Semi-transparent white background
        padding: '2rem', // p-8
        borderRadius: '0.75rem', // rounded-xl
        boxShadow: '0 0 40px rgba(59, 130, 246, 0.3), 0 0 80px rgba(59, 130, 246, 0.2)', // Blue glow effect
        border: '1px solid rgba(255, 255, 255, 0.1)', // Subtle border
        backdropFilter: 'blur(5px)', // Glassmorphism effect
        zIndex: 1, // Ensure content is above background elements
        position: 'relative' // For internal stacking context
      }}>
        <h1 style={{
          fontSize: '3rem', // text-5xl
          fontWeight: '800', // font-extrabold
          textAlign: 'center',
          marginBottom: '2.5rem', // mb-10
          color: '#7dd3fc', // Light blue color for the title
          lineHeight: '1.25', // leading-tight
          textShadow: '0 0 15px rgba(125, 211, 252, 0.7)' // Glowing text effect
        }}>
          AI Excel Validator
        </h1>

        {/* File Upload Section */}
        <div style={{
          marginBottom: '2.5rem', // mb-10
          padding: '2rem', // p-8
          border: '1px solid rgba(255, 255, 255, 0.1)', // Subtle border
          borderRadius: '0.75rem', // rounded-xl
          backgroundColor: 'rgba(255, 255, 255, 0.05)', // Semi-transparent white background
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxShadow: '0 0 30px rgba(168, 85, 247, 0.2), 0 0 60px rgba(168, 85, 247, 0.1)', // Purple glow effect
          backdropFilter: 'blur(3px)', // subtle blur
        }}>
          <label htmlFor="file-upload" style={{
            display: 'block',
            fontSize: '1.25rem', // text-xl
            fontWeight: '600', // font-semibold
            color: '#a5b4fc', // Light text color
            marginBottom: '1.25rem' // mb-5
          }}>
            Upload your Excel/CSV file for validation:
          </label>
          <input
            id="file-upload"
            type="file"
            onChange={handleUpload}
            style={{
              display: 'block',
              width: '100%',
              maxWidth: '32rem', // max-w-lg
              fontSize: '1rem', // text-base
              // Custom file input styling
              padding: '0.75rem 1.5rem',
              borderRadius: '9999px', // rounded-full
              border: '1px solid rgba(59, 130, 246, 0.4)', // Blue border
              fontWeight: '600', // font-semibold
              backgroundColor: 'rgba(59, 130, 246, 0.1)', // Subtle blue background
              color: '#7dd3fc', // Light blue text
              cursor: 'pointer',
              transition: 'all 0.3s ease-in-out',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(59, 130, 246, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          {showValidate && (
            <div style={{
              marginTop: '2rem', // mt-8
              display: 'flex',
              flexDirection: 'column', // Changed to column for better vertical spacing on small screens
              alignItems: 'center',
              gap: '1.5rem' // space-y-6
            }}>
              <button
                onClick={handleValidate}
                style={{
                  backgroundColor: '#22c55e', // bg-green-500
                  color: '#fff',
                  padding: '0.75rem 2rem', // py-3 px-8
                  borderRadius: '0.5rem', // rounded-lg
                  fontWeight: '700', // font-bold
                  fontSize: '1.125rem', // text-lg
                  cursor: 'pointer',
                  border: 'none',
                  boxShadow: '0 0 20px rgba(34, 197, 94, 0.5), inset 0 0 10px rgba(255, 255, 255, 0.2)', // Green glow
                  transition: 'background-color 0.3s ease-in-out, transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
                  opacity: loading ? 0.7 : 1, // disabled styling
                  width: '100%', // Ensure button takes full width on small screens
                  maxWidth: '16rem' // Limit width on larger screens
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#16a34a'; // Darker green on hover
                    e.currentTarget.style.transform = 'translateY(-0.25rem)'; // hover:-translate-y-1
                    e.currentTarget.style.boxShadow = '0 0 30px rgba(34, 197, 94, 0.7), inset 0 0 15px rgba(255, 255, 255, 0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#22c55e';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 0 20px rgba(34, 197, 94, 0.5), inset 0 0 10px rgba(255, 255, 255, 0.2)';
                  }
                }}
                disabled={loading}
              >
                {loading ? "Validating..." : "Validate Data"}
              </button>
              {loading && (
                <div style={{
                  color: '#86efac', // Light green text for loading
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '1.125rem', // text-lg
                  fontWeight: '500' // font-medium
                }}>
                  <span style={{
                    animation: 'spin 1s linear infinite', // animate-spin
                    marginRight: '0.75rem', // mr-3
                    fontSize: '1.5rem' // text-2xl
                  }}>⏳</span> Processing your data...
                  {/* Keyframe for spin animation */}
                  <style>
                    {`
                      @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                      }
                    `}
                  </style>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Download Button and Summary */}
        {(showDownload || Object.keys(statusCounts).length > 0) && (
          <div style={{
            marginBottom: '3rem', // mb-12
            padding: '2rem', // p-8
            border: '1px solid rgba(255, 255, 255, 0.1)', // Subtle border
            borderRadius: '0.75rem', // rounded-xl
            backgroundColor: 'rgba(255, 255, 255, 0.05)', // Semi-transparent white background
            boxShadow: '0 0 30px rgba(59, 130, 246, 0.2), 0 0 60px rgba(59, 130, 246, 0.1)', // Blue glow effect
            backdropFilter: 'blur(3px)', // subtle blur
          }}>
            <h3 style={{
              fontSize: '1.875rem', // text-3xl
              fontWeight: '700', // font-bold
              marginBottom: '1.5rem', // mb-6
              color: '#a5b4fc' // Light blue text
            }}>Validation Results Overview</h3>
            <div style={{
              display: 'flex',
              flexDirection: window.innerWidth < 640 ? 'column' : 'row', // sm:flex-row
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '2rem', // mb-8
              gap: '1.5rem' // gap-6
            }}>
              {showDownload && (
                <button
                  onClick={() => window.open("http://localhost:5000/download", "_blank")}
                  style={{
                    backgroundColor: '#8b5cf6', // bg-purple-500
                    color: '#fff',
                    padding: '0.75rem 2rem', // py-3 px-8
                    borderRadius: '0.5rem', // rounded-lg
                    fontWeight: '700', // font-bold
                    fontSize: '1.125rem', // text-lg
                    cursor: 'pointer',
                    border: 'none',
                    boxShadow: '0 0 20px rgba(139, 92, 246, 0.5), inset 0 0 10px rgba(255, 255, 255, 0.2)', // Purple glow
                    transition: 'background-color 0.3s ease-in-out, transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
                    width: window.innerWidth < 640 ? '100%' : 'auto', // w-full sm:w-auto
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#7c3aed'; // Darker purple on hover
                    e.currentTarget.style.transform = 'translateY(-0.25rem)'; // hover:-translate-y-1
                    e.currentTarget.style.boxShadow = '0 0 30px rgba(139, 92, 246, 0.7), inset 0 0 15px rgba(255, 255, 255, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#8b5cf6';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 0 20px rgba(139, 92, 246, 0.5), inset 0 0 10px rgba(255, 255, 255, 0.2)';
                  }}
                >
                  Download Validated File
                </button>
              )}
              {/* New Download Graphs Button */}
              {(Object.keys(statusCounts).length > 0 || (filterData && filterData.labels.length > 0) || (allRejectionData && allRejectionData.labels.length > 0)) && (
                <button
                  onClick={handleDownloadGraphs}
                  style={{
                    backgroundColor: '#14b8a6', // bg-teal-500
                    color: '#fff',
                    padding: '0.75rem 2rem', // py-3 px-8
                    borderRadius: '0.5rem', // rounded-lg
                    fontWeight: '700', // font-bold
                    fontSize: '1.125rem', // text-lg
                    cursor: 'pointer',
                    border: 'none',
                    boxShadow: '0 0 20px rgba(20, 184, 166, 0.5), inset 0 0 10px rgba(255, 255, 255, 0.2)', // Teal glow
                    transition: 'background-color 0.3s ease-in-out, transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
                    width: window.innerWidth < 640 ? '100%' : 'auto', // w-full sm:w-auto
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#0d9488'; // Darker teal on hover
                    e.currentTarget.style.transform = 'translateY(-0.25rem)'; // hover:-translate-y-1
                    e.currentTarget.style.boxShadow = '0 0 30px rgba(20, 184, 166, 0.7), inset 0 0 15px rgba(255, 255, 255, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#14b8a6';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 0 20px rgba(20, 184, 166, 0.5), inset 0 0 10px rgba(255, 255, 255, 0.2)';
                  }}
                >
                  Download All Graphs
                </button>
              )}
              {Object.keys(statusCounts).length > 0 && (
                <div style={{
                  fontSize: '1.25rem', // text-xl
                  fontWeight: '600', // font-semibold
                  color: '#e0e7ff', // Light text for count
                  backgroundColor: 'rgba(255, 255, 255, 0.1)', // Semi-transparent background
                  padding: '1rem', // p-4
                  borderRadius: '0.5rem', // rounded-lg
                  boxShadow: '0 0 15px rgba(255, 255, 255, 0.1), inset 0 0 8px rgba(255, 255, 255, 0.05)', // Subtle white glow
                  border: '1px solid rgba(255, 255, 255, 0.15)', // Light subtle border
                  width: window.innerWidth < 640 ? '100%' : 'auto', // w-full sm:w-auto
                  textAlign: 'center',
                }}>
                  <strong style={{ color: '#86efac' }}>Total Accepted:</strong> {statusCounts.Accepted || 0} <br />
                  <strong style={{ color: '#f87171' }}>Total Rejected:</strong> {statusCounts.Rejected || 0}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Graphs Section */}
        {(allRejectionData || filterData || Object.keys(statusCounts).length > 0) && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: window.innerWidth < 768 ? '1fr' : 'repeat(2, 1fr)', // grid-cols-1 md:grid-cols-2
            gap: '2.5rem' // gap-10
          }}>
            {/* Graph 1: Validation Status (Doughnut Chart) */}
            {Object.keys(statusCounts).length > 0 && (
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)', // Semi-transparent white background
                padding: '2rem', // p-8
                borderRadius: '0.75rem', // rounded-xl
                boxShadow: '0 0 30px rgba(34, 197, 94, 0.2), 0 0 60px rgba(34, 197, 94, 0.1)', // Green glow effect
                border: '1px solid rgba(255, 255, 255, 0.1)', // Subtle border
                backdropFilter: 'blur(3px)', // subtle blur
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}>
                <h4 style={{
                  fontSize: '1.5rem', // text-2xl
                  fontWeight: '700', // font-bold
                  textAlign: 'center',
                  marginBottom: '1.5rem', // mb-6
                  color: '#bebebe' // Light text color
                }}>Validation Status</h4>
                <div style={{
                  height: '18rem', // h-72
                  width: '100%',
                  maxWidth: '24rem', // max-w-sm
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Doughnut ref={validationStatusChartRef} data={validationStatusData} options={validationStatusOptions} />
                </div>
              </div>
            )}

            {/* Graph 2: All Rejection Reasons Breakdown (Horizontal Bar Chart) */}
            {allRejectionData && allRejectionData.labels.length > 0 ? (
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)', // Semi-transparent white background
                padding: '2rem',
                borderRadius: '0.75rem',
                boxShadow: '0 0 30px rgba(239, 68, 68, 0.2), 0 0 60px rgba(239, 68, 68, 0.1)', // Red glow effect
                border: '1px solid rgba(255, 255, 255, 0.1)', // Subtle border
                backdropFilter: 'blur(3px)', // subtle blur
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}>
                <h4 style={{
                  fontSize: '1.5rem',
                  fontWeight: '700',
                  textAlign: 'center',
                  marginBottom: '1.5rem',
                  color: '#bebebe' // Light text color
                }}>All Rejection Reasons Breakdown</h4>
                <div style={{ height: '20rem', width: '100%', position: 'relative' }}> {/* h-72 */}
                  <Bar
                    ref={allRejectionChartRef}
                    data={allRejectionData}
                    options={{
                      indexAxis: 'y',
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: {
                          display: false,
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `${context.dataset.label}: ${context.raw}`;
                                }
                            }
                        }
                      },
                      scales: {
                        x: {
                          beginAtZero: true,
                          ticks: {
                              color: '#a5b4fc' // Light ticks for x-axis
                          },
                          grid: {
                              color: 'rgba(255, 255, 255, 0.1)' // Light grid lines
                          }
                        },
                        y: {
                          ticks: {
                            font: {
                              size: 12
                            },
                            color: '#a5b4fc' // Light ticks for y-axis
                          },
                          grid: {
                            color: 'rgba(255, 255, 255, 0.1)' // Light grid lines
                          }
                        }
                      },
                    }}
                  />
                </div>
              </div>
            ) : (
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                padding: '2rem',
                borderRadius: '0.75rem',
                boxShadow: '0 0 30px rgba(239, 68, 68, 0.2), 0 0 60px rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(3px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#a5b4fc', // Light text for message
                height: '18rem',
              }}>
                <p style={{ fontSize: '1.125rem', textAlign: 'center' }}>No detailed rejection data available to display this chart.</p>
              </div>
            )}
            {filterData && filterData.labels.length > 0 ? (
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)', // Semi-transparent white background
                padding: '2rem',
                borderRadius: '0.75rem',
                boxShadow: '0 0 30px rgba(139, 92, 246, 0.2), 0 0 60px rgba(139, 92, 246, 0.1)', // Purple glow effect
                border: '1px solid rgba(255, 255, 255, 0.1)', // Subtle border
                backdropFilter: 'blur(3px)', // subtle blur
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gridColumn: window.innerWidth < 768 ? 'auto' : 'span 2',
                minWidth: '0',
                overflowX: 'auto'
              }}>
                <h4 style={{
                  fontSize: '1.5rem',
                  fontWeight: '700',
                  textAlign: 'center',
                  marginBottom: '1.5rem',
                  color: '#bebebe' // Light text color
                }}>Filter-wise Accepted vs Rejected</h4>
                <div style={{
                  height: '20rem',
                  width: '100%',
                  minWidth: filterData.labels.length * 100 + 'px',
                  position: 'relative'
                }}>
                  <Bar
                    ref={filterChartRef}
                    data={filterData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: {
                        x: {
                          stacked: false,
                          ticks: {
                            autoSkip: false, // Prevent skipping labels
                            maxRotation: 45, // Rotate labels if needed
                            minRotation: 45,
                            font: {
                              size: 12
                            },
                            color: '#a5b4fc' // Light ticks for x-axis
                          },
                          grid: {
                              color: 'rgba(255, 255, 255, 0.1)' // Light grid lines
                          }
                        },
                        y: {
                          stacked: false, // Not stacked
                          beginAtZero: true,
                          ticks: {
                              color: '#a5b4fc' // Light ticks for y-axis
                          },
                          grid: {
                              color: 'rgba(255, 255, 255, 0.1)' // Light grid lines
                          }
                        },
                      },
                      plugins: {
                        legend: {
                          position: 'top',
                          labels: {
                            color: '#e0e7ff' // Light legend labels
                          }
                        },
                        tooltip: {
                          mode: 'index',
                          intersect: false,
                        }
                      }
                    }}
                  />
                </div>
              </div>
            ) : (
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                padding: '2rem',
                borderRadius: '0.75rem',
                boxShadow: '0 0 30px rgba(139, 92, 246, 0.2), 0 0 60px rgba(139, 92, 246, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(3px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#a5b4fc', // Light text for message
                height: '18rem',
                gridColumn: window.innerWidth < 768 ? 'auto' : 'span 2'
              }}>
                <p style={{ fontSize: '1.125rem', textAlign: 'center' }}>No filter data found in the uploaded file to display this chart.</p>
                <p style={{ fontSize: '0.875rem', textAlign: 'center', marginTop: '0.5rem' }}>(Ensure your file has a 'Theme' or 'Focus Area' column with valid categories.)</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;