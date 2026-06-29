from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
import os
from openai import OpenAI

# Initialize client using environment variable OPENAI_API_KEY
client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY', 'mock-key'))

class TranscribeAudioView(APIView):
    def post(self, request):
        if 'audio' not in request.FILES:
            return Response({"error": "No audio file provided"}, status=status.HTTP_400_BAD_REQUEST)
        
        audio_file = request.FILES['audio']
        
        try:
            transcript = client.audio.transcriptions.create(
                model="whisper-1", 
                file=audio_file
            )
            text = transcript.text
            
            prompt = (
                "Extrae los problemas reportados del siguiente texto o transcripción de audio "
                "y devuélvelos como una lista clara de puntos (bullet points):\n\n"
                f"{text}"
            )
            
            completion = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "Eres un asistente de taller mecánico experto en diagnosticar problemas vehiculares de forma concisa."},
                    {"role": "user", "content": prompt}
                ]
            )
            
            issues = completion.choices[0].message.content
            
            return Response({"issues": issues}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GenerateDiagnosisView(APIView):
    def post(self, request):
        notes = request.data.get('notes', '')
        if not notes:
            return Response({"error": "Notes are required"}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            prompt = (
                "Basado en las siguientes notas y problemas reportados del vehículo:\n"
                f"{notes}\n\n"
                "Genera un diagnóstico técnico preliminar y recomienda 3 a 5 servicios "
                "específicos que deberían realizarse para solucionar estos problemas. "
                "Formatea la respuesta claramente."
            )
            
            completion = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "Eres un mecánico maestro experto. Da respuestas profesionales, técnicas pero comprensibles."},
                    {"role": "user", "content": prompt}
                ]
            )
            
            diagnosis = completion.choices[0].message.content
            
            return Response({"diagnosis": diagnosis}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
