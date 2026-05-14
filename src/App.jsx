import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import jsPDF from 'jspdf';
import allProjectsList from './projects';

const allowedSpecializations = ["ai", "ai.go", "mobile-dev", "gaming", "blockchain", "cybersecurity", "devops", "user-experience", "java"];

function formatName(str) {
  return str.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export default function App() {
  const [view, setView] = useState('selection'); // 'selection', 'requirements', 'survey', 'report'
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSpec, setActiveSpec] = useState('Root Projects');
  const [selectedProject, setSelectedProject] = useState(null);
  
  const [reqContent, setReqContent] = useState('');
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({}); // index -> { result: 'Pass'/'Fail', reason: '' }
  
  const [reportLines, setReportLines] = useState([]);
  const surveyFormRef = useRef(null);

  // Derived state for selection view
  const specializations = new Set();
  const projectsBySpec = {};
  const rootProjects = [];

  allProjectsList.forEach(path => {
    if (path.includes('/')) {
      const parts = path.split('/');
      const spec = parts[0];
      if (allowedSpecializations.includes(spec.toLowerCase())) {
        specializations.add(spec);
        if (!projectsBySpec[spec]) projectsBySpec[spec] = [];
        projectsBySpec[spec].push(path);
      } else {
        rootProjects.push(path);
      }
    } else {
      rootProjects.push(path);
    }
  });

  const specArray = Array.from(specializations).sort();

  let displayedProjects = [];
  let displayTitle = '';

  if (searchQuery) {
    displayedProjects = allProjectsList.filter(p => p.toLowerCase().includes(searchQuery.toLowerCase()));
    displayTitle = "Search Results";
  } else {
    if (activeSpec === 'Root Projects') {
      displayedProjects = rootProjects;
      displayTitle = "Root Projects";
    } else {
      const specKey = specArray.find(s => formatName(s) === activeSpec);
      displayedProjects = projectsBySpec[specKey] || [];
      displayTitle = `${activeSpec} Projects`;
    }
  }

  // Group root folders
  const files = [];
  const folders = {};
  
  displayedProjects.forEach(path => {
    if (displayTitle === "Root Projects" && path.includes('/')) {
      const folderName = path.split('/')[0];
      if (!folders[folderName]) folders[folderName] = [];
      folders[folderName].push(path);
    } else {
      files.push(path);
    }
  });

  const handleSelectProject = async (path) => {
    try {
      const res = await fetch(`/public-master/subjects/${path}/README.md`);
      if (!res.ok) throw new Error(`Requirements README not found for project: ${path}`);
      const text = await res.text();
      setReqContent(marked.parse(text));
      setSelectedProject(path);
      setView('requirements');
    } catch (e) {
      alert(e.message);
    }
  };

  const handleStartAudit = async () => {
    try {
      const res = await fetch(`/public-master/subjects/${selectedProject}/audit/README.md`);
      if (!res.ok) {
        alert("No audit questions available at the current moment.");
        return;
      }
      const text = await res.text();
      
      const tokens = marked.lexer(text);
      const parsedQuestions = [];
      let currentHTML = "";
      
      tokens.forEach(token => {
        if (token.type === 'heading' && token.depth === 6) {
          parsedQuestions.push({
            contextHTML: currentHTML,
            questionHTML: marked.parseInline(token.text),
            rawText: token.text
          });
          currentHTML = "";
        } else {
          currentHTML += marked.parse(token.raw);
        }
      });
      
      if (currentHTML.trim()) {
        parsedQuestions.push({
          contextHTML: currentHTML,
          isTrailing: true
        });
      }

      setQuestions(parsedQuestions);
      setAnswers({});
      setView('survey');
      setTimeout(() => {
        surveyFormRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (e) {
      alert("No audit questions available at the current moment.");
    }
  };

  const handleGenerateReport = () => {
    let allAnswered = true;
    const lines = [];
    
    // Only real questions (ignore trailing context)
    const realQuestions = questions.filter(q => !q.isTrailing);

    for (let i = 0; i < realQuestions.length; i++) {
      const ans = answers[i];
      if (!ans || !ans.result) {
        alert('Please answer question #' + (i + 1));
        allAnswered = false;
        break;
      }
      if (ans.result === 'Fail' && (!ans.reason || ans.reason.trim() === '')) {
        alert('Please provide a reason for failing question #' + (i + 1));
        allAnswered = false;
        break;
      }
      const reasonText = ans.result === 'Fail' ? ans.reason.trim() : '';
      lines.push(`Question ${i + 1}:\n${realQuestions[i].rawText}\nResult: ${ans.result}${reasonText ? '\nReason: ' + reasonText : ''}\n`);
    }
    
    if (!allAnswered) return;
    setReportLines(lines);
    setView('report');
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const passedCount = reportLines.filter(line => line.includes('Result: Pass')).length;
    const failedCount = reportLines.length - passedCount;
    const overallResult = failedCount === 0 ? 'PASSED' : 'FAILED';

    let text = `Audit Summary: ${selectedProject}\n`;
    text += `Date: ${new Date().toLocaleDateString()}\n`;
    text += `Total Questions: ${reportLines.length}\n`;
    text += `Passed: ${passedCount}\n`;
    text += `Failed: ${failedCount}\n`;
    text += `Overall Result: ${overallResult}\n\n`;
    text += `--- Details ---\n\n`;
    text += reportLines.join('\n');

    const splitText = doc.splitTextToSize(text, 180);
    let cursorY = 10;
    const lineHeight = 10;
    splitText.forEach((line) => {
      if (cursorY + lineHeight > doc.internal.pageSize.height - 10) {
        doc.addPage();
        cursorY = 10;
      }
      doc.text(line, 10, cursorY);
      cursorY += lineHeight;
    });
    doc.save(`audit_report_${selectedProject.replace(/\//g, '_')}.pdf`);
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"></path><path d="M2 17l10 5 10-5"></path><path d="M2 12l10 5 10-5"></path></svg>
          <span>Audit Platform</span>
        </div>
      </header>

      <main className="app-main">
        {view === 'selection' && (
          <div className="selection-view">
            <div className="hero-section">
              <h1>Select a Project to Audit</h1>
              <p className="subtitle">Choose from specializations or browse all projects</p>
              <div className="search-wrapper">
                <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <input 
                  type="text" 
                  className="search-input" 
                  placeholder="Search projects by name (e.g. filler, java)..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {!searchQuery && (
              <div className="specializations-section">
                <h2 className="section-title">Specializations</h2>
                <div className="spec-grid">
                  <div className={`spec-card ${activeSpec === 'Root Projects' ? 'active' : ''}`} onClick={() => setActiveSpec('Root Projects')}>
                    <h3>Root Projects</h3>
                    <p>{rootProjects.length} projects</p>
                  </div>
                  {specArray.map(spec => (
                    <div key={spec} className={`spec-card ${activeSpec === formatName(spec) ? 'active' : ''}`} onClick={() => setActiveSpec(formatName(spec))}>
                      <h3>{formatName(spec)}</h3>
                      <p>{projectsBySpec[spec].length} projects</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="projects-section">
              <h2 className="section-title">{displayTitle}</h2>
              <div className="projects-grid">
                {Object.keys(folders).sort().map(folderName => (
                  <div key={folderName} className="project-card folder-card" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }} onClick={() => {
                      setSearchQuery(folderName);
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
                      <div className="project-icon">📁</div>
                      <div className="project-name" style={{ fontWeight: 600 }}>{folderName}</div>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: '2rem' }}>{folders[folderName].length} projects</div>
                  </div>
                ))}

                {files.map(path => {
                  let name = path;
                  if (path.includes('/') && displayTitle !== "Root Projects" && displayTitle !== "Search Results") {
                    name = path.substring(path.indexOf('/') + 1);
                  }
                  return (
                    <div key={path} className="project-card" onClick={() => handleSelectProject(path)}>
                      <div className="project-icon">📄</div>
                      <div className="project-name">{name}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {(view === 'requirements' || view === 'survey' || view === 'report') && (
          <div className="audit-view">
            <button className="btn-text" onClick={() => { setView('selection'); setSelectedProject(null); }}>← Back to Projects</button>
            <div className="audit-header">
              <h2>Project Requirements</h2>
              <span className="badge">{selectedProject}</span>
            </div>
            <div className="markdown-content" dangerouslySetInnerHTML={{ __html: reqContent }}></div>
            {view === 'requirements' && (
              <div className="action-bar">
                <button className="btn-primary" onClick={handleStartAudit}>Start Audit Questionnaire</button>
              </div>
            )}
          </div>
        )}

        {(view === 'survey' || view === 'report') && (
          <form className="survey-view" ref={surveyFormRef}>
            <div className="audit-header">
              <h2>Audit Questionnaire</h2>
              <span className="badge">{selectedProject}</span>
            </div>
            <div className="questions-list">
              {questions.map((q, i) => {
                if (q.isTrailing) {
                  return (
                    <div key={`trail-${i}`} className="audit-context audit-row-container" dangerouslySetInnerHTML={{ __html: q.contextHTML }}></div>
                  );
                }

                const ans = answers[i] || {};

                return (
                  <div key={i} className="audit-row-container">
                    <div className="audit-row">
                      <div className="audit-content">
                        {q.contextHTML && <div className="audit-context" dangerouslySetInnerHTML={{ __html: q.contextHTML }}></div>}
                        <div className="audit-question-text" dangerouslySetInnerHTML={{ __html: q.questionHTML }}></div>
                      </div>
                      <div className="audit-actions">
                        <label className="radio-label">
                          <input 
                            type="radio" 
                            name={`answer-${i}`} 
                            value="Pass" 
                            checked={ans.result === 'Pass'}
                            onChange={() => setAnswers({...answers, [i]: { ...ans, result: 'Pass' }})}
                          /> YES
                        </label>
                        <label className="radio-label">
                          <input 
                            type="radio" 
                            name={`answer-${i}`} 
                            value="Fail" 
                            checked={ans.result === 'Fail'}
                            onChange={() => setAnswers({...answers, [i]: { ...ans, result: 'Fail' }})}
                          /> NO
                        </label>
                      </div>
                    </div>
                    {ans.result === 'Fail' && (
                      <textarea 
                        className="reason-input" 
                        placeholder="Reason for NO..." 
                        style={{ marginTop: '1rem' }}
                        value={ans.reason || ''}
                        onChange={e => setAnswers({...answers, [i]: { ...ans, reason: e.target.value }})}
                      ></textarea>
                    )}
                  </div>
                );
              })}
            </div>
            {view === 'survey' && (
               <div className="action-bar">
                 <button type="button" className="btn-primary" onClick={handleGenerateReport}>Complete Audit & Generate Report</button>
               </div>
            )}
          </form>
        )}
      </main>

      {view === 'report' && (
        <div className="modal">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Audit Report</h2>
              <button className="btn-icon" onClick={() => setView('survey')}>✕</button>
            </div>
            <div className="modal-body">
              <pre>
                {`Audit Summary: ${selectedProject}\nDate: ${new Date().toLocaleDateString()}\nTotal Questions: ${reportLines.length}\nPassed: ${reportLines.filter(line => line.includes('Result: Pass')).length}\nFailed: ${reportLines.length - reportLines.filter(line => line.includes('Result: Pass')).length}\nOverall Result: ${reportLines.filter(line => line.includes('Result: Pass')).length === reportLines.length ? 'PASSED' : 'FAILED'}\n\n--- Details ---\n\n${reportLines.join('\n')}`}
              </pre>
            </div>
            <div className="modal-footer">
              <button className="btn-primary" onClick={exportPDF}>Export as PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
