import os
from google import genai
from PIL import Image

class GeminiSafetyAnalyzer:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        # Initialize client if key is present
        self.client = genai.Client(api_key=api_key) if api_key else None

    def analyze_incident(self, image: Image.Image, violations: list) -> str:
        if not self.client:
            return "Gemini API key unconfigured."

        prompt = f"""
        You are an industrial OSHA Safety Auditor. Analyze this frame where the following violations were flagged: {', '.join(violations)}.
        Provide a concise report:
        1. Primary Hazard Identified
        2. ISO 45001 / OSHA Compliance Severity
        3. Recommended Immediate Corrective Action
        """

        try:
            response = self.client.models.generate_content(
                model='gemini-2.5-flash',
                contents=[prompt, image]
            )
            return response.text
        except Exception as e:
            print(f"Gemini API Error: {e}")
            return f"Gemini Audit Unavailable: {str(e)}"