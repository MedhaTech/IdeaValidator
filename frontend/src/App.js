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

  // Refs for chart canvases to enable image download
  const validationStatusChartRef = useRef(null);
  const filterChartRef = useRef(null);
  const allRejectionChartRef = useRef(null);

  // Function to handle user login
  const login = async () => {
    try {
      // Make a POST request to the login endpoint
      await axios.post("http://ec2-13-204-80-238.ap-south-1.compute.amazonaws.com:5000/login", user, {
        withCredentials: true, // Send cookies with the request
      });
      setLoggedIn(true); // Set loggedIn to true on successful login
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
      const res = await axios.post("http://ec2-13-204-80-238.ap-south-1.compute.amazonaws.com:5000/upload", formData, {
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


  // Render the login page if not logged in
  if (!loggedIn) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(to bottom right, #eff6ff, #e0e7ff)', // from-blue-50 to-indigo-100
        fontFamily: 'Inter, sans-serif' // Changed font to Inter
      }}>
        <div style={{
          backgroundColor: '#fff',
          padding: '2rem',
          borderRadius: '0.75rem', // rounded-xl
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', // shadow-2xl
          width: '100%',
          maxWidth: '28rem', // max-w-md
          transition: 'transform 0.3s ease-in-out', // transform transition-all duration-300
        }}>
          <h2 style={{
            fontSize: '2.25rem', // text-4xl
            fontWeight: '800', // font-extrabold
            textAlign: 'center',
            marginBottom: '2rem', // mb-8
            color: '#1a202c' // text-gray-900
          }}>Welcome!</h2>
          <p style={{
            textAlign: 'center',
            color: '#4a5568', // text-gray-600
            marginBottom: '1.5rem' // mb-6
          }}>Please log in to access the AI Excel Validator.</p>
          <input
            type="text"
            placeholder="Username"
            style={{
              width: '100%',
              padding: '1rem', // p-4
              marginBottom: '1rem', // mb-4
              border: '1px solid #e2e8f0', // border border-gray-300
              borderRadius: '0.5rem', // rounded-lg
              outline: 'none',
              fontSize: '1.125rem', // text-lg
              transition: 'all 0.2s ease-in-out', // transition duration-200
              boxSizing: 'border-box'
            }}
            onFocus={(e) => e.target.style.boxShadow = '0 0 0 4px rgba(96, 165, 250, 0.25)'} // focus:ring-4 focus:ring-blue-200
            onBlur={(e) => e.target.style.boxShadow = 'none'}
            onChange={(e) => setUser({ ...user, username: e.target.value })}
          />
          <input
            type="password"
            placeholder="Password"
            style={{
              width: '100%',
              padding: '1rem', // p-4
              marginBottom: '1.5rem', // mb-6
              border: '1px solid #e2e8f0', // border border-gray-300
              borderRadius: '0.5rem', // rounded-lg
              outline: 'none',
              fontSize: '1.125rem', // text-lg
              transition: 'all 0.2s ease-in-out', // transition duration-200
              boxSizing: 'border-box'
            }}
            onFocus={(e) => e.target.style.boxShadow = '0 0 0 4px rgba(96, 165, 250, 0.25)'} // focus:ring-4 focus:ring-blue-200
            onBlur={(e) => e.target.style.boxShadow = 'none'}
            onChange={(e) => setUser({ ...user, password: e.target.value })}
          />
          <button
            onClick={login}
            style={{
              width: '100%',
              backgroundColor: '#2563eb', // bg-blue-600
              color: '#fff',
              padding: '1rem', // p-4
              borderRadius: '0.5rem', // rounded-lg
              fontWeight: '700', // font-bold
              fontSize: '1.25rem', // text-xl
              cursor: 'pointer',
              border: 'none',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', // shadow-lg
              transition: 'background-color 0.3s ease-in-out, transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out', // transition duration-300 ease-in-out
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#1d4ed8'; // hover:bg-blue-700
              e.currentTarget.style.transform = 'translateY(-0.25rem)'; // hover:-translate-y-1
              e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'; // hover:shadow-xl
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#2563eb';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
            }}
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  // Render the main application once logged in
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(to bottom right, #f9fafb, #e0e7ff)', // from-gray-50 to-blue-100
      padding: '1.5rem', // p-6
      fontFamily: 'Inter, sans-serif', // Changed font to Inter
      color: '#2d3748' // text-gray-800
    }}>
      <div style={{
        maxWidth: '80rem', // max-w-7xl
        margin: '0 auto', // mx-auto
        backgroundColor: '#fff',
        padding: '2rem', // p-8
        borderRadius: '0.75rem', // rounded-xl
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)', // shadow-2xl
        border: '1px solid #e2e8f0' // border border-gray-200
      }}>
        <h1 style={{
          fontSize: '3rem', // text-5xl
          fontWeight: '800', // font-extrabold
          textAlign: 'center',
          marginBottom: '2.5rem', // mb-10
          color: '#1a202c', // text-gray-900
          lineHeight: '1.25' // leading-tight
        }}>
          AI Excel Validator
        </h1>

        {/* File Upload Section */}
        <div style={{
          marginBottom: '2.5rem', // mb-10
          padding: '2rem', // p-8
          border: '1px solid #e2e8f0', // border border-gray-200
          borderRadius: '0.75rem', // rounded-xl
          backgroundColor: '#eff6ff', // bg-blue-50
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' // shadow-md
        }}>
          <label htmlFor="file-upload" style={{
            display: 'block',
            fontSize: '1.25rem', // text-xl
            fontWeight: '600', // font-semibold
            color: '#4a5568', // text-gray-700
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
              color: '#4a5568', // text-gray-700
              // Custom file input styling (complex with inline styles, simplified)
              padding: '0.75rem 1.5rem',
              borderRadius: '9999px', // rounded-full
              border: '1px solid #bfdbfe', // border-0 (conceptually)
              fontWeight: '600', // font-semibold
              backgroundColor: '#dbeafe', // bg-blue-100
              color: '#1e40af', // text-blue-700
              cursor: 'pointer',
              transition: 'background-color 0.2s ease-in-out',
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#bfdbfe'} // hover:file:bg-blue-200
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#dbeafe'}
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
                  backgroundColor: '#059669', // bg-green-600
                  color: '#fff',
                  padding: '0.75rem 2rem', // py-3 px-8
                  borderRadius: '0.5rem', // rounded-lg
                  fontWeight: '700', // font-bold
                  fontSize: '1.125rem', // text-lg
                  cursor: 'pointer',
                  border: 'none',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', // shadow-lg
                  transition: 'background-color 0.3s ease-in-out, transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
                  opacity: loading ? 0.7 : 1, // disabled styling
                  width: '100%', // Ensure button takes full width on small screens
                  maxWidth: '16rem' // Limit width on larger screens
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#047857'; // hover:bg-green-700
                    e.currentTarget.style.transform = 'translateY(-0.25rem)'; // hover:-translate-y-1
                    e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'; // hover:shadow-xl
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.backgroundColor = '#059669';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                  }
                }}
                disabled={loading}
              >
                {loading ? "Validating..." : "Validate Data"}
              </button>
              {loading && (
                <div style={{
                  color: '#065f46', // text-green-700
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
            border: '1px solid #e2e8f0', // border border-gray-200
            borderRadius: '0.75rem', // rounded-xl
            backgroundColor: '#f3e8ff', // bg-purple-50
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' // shadow-md
          }}>
            <h3 style={{
              fontSize: '1.875rem', // text-3xl
              fontWeight: '700', // font-bold
              marginBottom: '1.5rem', // mb-6
              color: '#2d3748' // text-gray-800
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
                  onClick={() => window.open("http://ec2-13-204-80-238.ap-south-1.compute.amazonaws.com:5000/download", "_blank")}
                  style={{
                    backgroundColor: '#6b21a8', // bg-purple-700
                    color: '#fff',
                    padding: '0.75rem 2rem', // py-3 px-8
                    borderRadius: '0.5rem', // rounded-lg
                    fontWeight: '700', // font-bold
                    fontSize: '1.125rem', // text-lg
                    cursor: 'pointer',
                    border: 'none',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', // shadow-lg
                    transition: 'background-color 0.3s ease-in-out, transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
                    width: window.innerWidth < 640 ? '100%' : 'auto', // w-full sm:w-auto
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#581c87'; // hover:bg-purple-800
                    e.currentTarget.style.transform = 'translateY(-0.25rem)'; // hover:-translate-y-1
                    e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'; // hover:shadow-xl
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#6b21a8';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
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
                    backgroundColor: '#0f766e', // bg-teal-700
                    color: '#fff',
                    padding: '0.75rem 2rem', // py-3 px-8
                    borderRadius: '0.5rem', // rounded-lg
                    fontWeight: '700', // font-bold
                    fontSize: '1.125rem', // text-lg
                    cursor: 'pointer',
                    border: 'none',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', // shadow-lg
                    transition: 'background-color 0.3s ease-in-out, transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
                    width: window.innerWidth < 640 ? '100%' : 'auto', // w-full sm:w-auto
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#115e59'; // hover:bg-teal-800
                    e.currentTarget.style.transform = 'translateY(-0.25rem)'; // hover:-translate-y-1
                    e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'; // hover:shadow-xl
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#0f766e';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                  }}
                >
                  Download All Graphs
                </button>
              )}
              {Object.keys(statusCounts).length > 0 && (
                <div style={{
                  fontSize: '1.25rem', // text-xl
                  fontWeight: '600', // font-semibold
                  color: '#4a5568', // text-gray-700
                  backgroundColor: '#fff',
                  padding: '1rem', // p-4
                  borderRadius: '0.5rem', // rounded-lg
                  boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)', // shadow-inner
                  border: '1px solid #f7fafc', // border border-gray-100
                  width: window.innerWidth < 640 ? '100%' : 'auto', // w-full sm:w-auto
                  textAlign: 'center',
                  // sm:text-left is tricky with inline styles, relies on flex-direction change
                }}>
                  <strong style={{ color: '#059669' }}>Total Accepted:</strong> {statusCounts.Accepted || 0} <br />
                  <strong style={{ color: '#dc2626' }}>Total Rejected:</strong> {statusCounts.Rejected || 0}
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
                backgroundColor: '#fff',
                padding: '2rem', // p-8
                borderRadius: '0.75rem', // rounded-xl
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', // shadow-xl
                border: '1px solid #e2e8f0', // border border-gray-200
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center'
              }}>
                <h4 style={{
                  fontSize: '1.5rem', // text-2xl
                  fontWeight: '700', // font-bold
                  textAlign: 'center',
                  marginBottom: '1.5rem', // mb-6
                  color: '#2d3748' // text-gray-800
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

            {/* Graph 2: All Rejection Reasons Breakdown (Horizontal Bar Chart) - Moved here */}
            {allRejectionData && allRejectionData.labels.length > 0 ? (
              <div style={{
                backgroundColor: '#fff',
                padding: '2rem',
                borderRadius: '0.75rem',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                // Removed gridColumn: 'span 2' so it sits next to the Doughnut chart
              }}>
                <h4 style={{
                  fontSize: '1.5rem',
                  fontWeight: '700',
                  textAlign: 'center',
                  marginBottom: '1.5rem',
                  color: '#2d3748'
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
                      },
                      scales: {
                        x: {
                          beginAtZero: true,
                        },
                        y: {
                          ticks: {
                            font: {
                              size: 12 
                            }
                          }
                        }
                      },
                    }}
                  />
                </div>
              </div>
            ) : (
              <div style={{
                backgroundColor: '#fff',
                padding: '2rem',
                borderRadius: '0.75rem',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#4a5568',
                height: '18rem',
                // Removed gridColumn: 'span 2'
              }}>
                <p style={{ fontSize: '1.125rem', textAlign: 'center' }}>No detailed rejection data available to display this chart.</p>
              </div>
            )}
            {filterData && filterData.labels.length > 0 ? (
              <div style={{
                backgroundColor: '#fff',
                padding: '2rem',
                borderRadius: '0.75rem',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                border: '1px solid #e2e8f0',
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
                  color: '#2d3748'
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
                              size: 12 // Adjust font size for labels
                            }
                          }
                        },
                        y: {
                          stacked: false, // Not stacked
                          beginAtZero: true,
                        },
                      },
                      plugins: {
                        legend: {
                          position: 'top',
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
                backgroundColor: '#fff',
                padding: '2rem',
                borderRadius: '0.75rem',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#4a5568',
                height: '18rem',
                gridColumn: window.innerWidth < 768 ? 'auto' : 'span 2' // Retain span 2
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
