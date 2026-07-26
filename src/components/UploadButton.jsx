import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import client from "@/api/client"

export default function UploadButton({ onSuccess }) {
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const [uploading, setUploading] = useState(false)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const form = new FormData()
    form.append("file", file)

    setUploading(true)
    try {
      const { data } = await client.post("/statements/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      toast.success(`${data.imported} transactions imported`)
      onSuccess?.()

      // Anything the rules did not match is waiting to be categorised by hand
      if (data.uncategorised > 0) {
        toast.info(`${data.uncategorised} need a category`)
        navigate("/review")
      }
    } catch (err) {
      const message = err.response?.data?.detail ?? "Upload failed"
      toast.error(message)
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? "Importing…" : "Import statement"}
      </Button>
    </>
  )
}
