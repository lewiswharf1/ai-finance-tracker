import { Routes, Route, Navigate } from "react-router-dom"
import Layout from "./components/Layout"
import Dashboard from "./pages/Dashboard"
import Trends from "./pages/Trends"
import Chat from "./pages/Chat"
import Review from "./pages/Review"
import Rules from "./pages/Rules"

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="trends" element={<Trends />} />
        <Route path="chat" element={<Chat />} />
        <Route path="review" element={<Review />} />
        <Route path="rules" element={<Rules />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
