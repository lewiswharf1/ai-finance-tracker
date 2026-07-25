import axios from "axios"

// In dev, Vite serves the UI on 5173 and the API lives on 8000. The built app is
// served by FastAPI itself, so requests go to the same origin.
const client = axios.create({
  baseURL: import.meta.env.DEV ? "http://localhost:8000" : "",
})

export default client
