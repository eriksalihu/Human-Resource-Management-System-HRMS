/**
 * @file frontend/src/App.jsx
 * @description Root application component with React Router configuration
 * @author Dev B
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom';

/**
 * Placeholder Home page component
 * @returns {JSX.Element} Home page with welcome message
 */
const Home = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          HR Management System
        </h1>
        <p className="text-lg text-gray-600">
          Sistemi per Menaxhimin e Resurseve Njerezore
        </p>
      </div>
    </div>
  );
};

/**
 * Root App component — sets up BrowserRouter and defines route structure
 * @returns {JSX.Element} Application with routing
 */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
