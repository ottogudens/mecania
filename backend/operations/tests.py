from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from django.contrib.auth.models import User
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
from operations.models import Client, WhatsAppMessage, WhatsAppSession, Vehicle, VisualInspection
from operations.views import _make_client_token

class ClientAuthTestCase(TestCase):
    def setUp(self):
        self.client_api = APIClient()
        self.client_user = Client.objects.create(
            first_name="Juan",
            last_name="Perez",
            email="juan.perez@example.com",
            phone="+56912345678",
            portal_enabled=True
        )
        self.client_user.set_pin("1234")
        self.client_user.save()

    def test_client_auth_success(self):
        url = reverse('client_auth')
        data = {'phone': '+56912345678', 'pin': '1234'}
        response = self.client_api.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('token', response.data)
        self.assertEqual(response.data['client_name'], 'Juan Perez')

    def test_client_auth_invalid_pin(self):
        url = reverse('client_auth')
        data = {'phone': '+56912345678', 'pin': '9999'} # Wrong PIN
        response = self.client_api.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('error', response.data)

    def test_client_auth_disabled_portal(self):
        self.client_user.portal_enabled = False
        self.client_user.save()

        url = reverse('client_auth')
        data = {'phone': '+56912345678', 'pin': '1234'}
        response = self.client_api.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_client_change_pin_unauthorized(self):
        url = reverse('client_change_pin')
        data = {'pin': '4321'}
        response = self.client_api.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_client_change_pin_success(self):
        # Generate token
        token = _make_client_token(self.client_user.id)
        self.client_api.credentials(HTTP_AUTHORIZATION=f'ClientToken {token}')

        url = reverse('client_change_pin')
        data = {'pin': '5678'}
        response = self.client_api.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])

        # Now test auth with the new pin
        self.client_api.credentials() # clear credentials
        auth_url = reverse('client_auth')
        auth_data = {'phone': '+56912345678', 'pin': '5678'}
        auth_response = self.client_api.post(auth_url, auth_data, format='json')
        self.assertEqual(auth_response.status_code, status.HTTP_200_OK)
        self.assertIn('token', auth_response.data)

    def test_client_change_pin_invalid_formats(self):
        token = _make_client_token(self.client_user.id)
        self.client_api.credentials(HTTP_AUTHORIZATION=f'ClientToken {token}')
        url = reverse('client_change_pin')

        # Scenario 1: Not a number
        response = self.client_api.post(url, {'pin': 'abcd'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # Scenario 2: Wrong length
        response = self.client_api.post(url, {'pin': '123'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # Scenario 3: Empty pin
        response = self.client_api.post(url, {'pin': ''}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class WhatsAppMessageTestCase(TestCase):
    def setUp(self):
        self.api_client = APIClient()
        self.user = User.objects.create_superuser(
            username="admin", 
            email="admin@example.com", 
            password="adminpassword"
        )
        self.api_client.force_authenticate(user=self.user)
        
        self.client_user = Client.objects.create(
            first_name="Diego",
            last_name="Maradona",
            email="diego@example.com",
            phone="+56999999999",
            portal_enabled=True
        )
        
        # Create some messages to test listing
        self.msg1 = WhatsAppMessage.objects.create(
            phone="+56999999999",
            client=self.client_user,
            sender="client",
            text="Hola, ¿tienen hora para hoy?"
        )
        self.msg2 = WhatsAppMessage.objects.create(
            phone="+56999999999",
            client=self.client_user,
            sender="assistant",
            text="Hola Diego. Sí, tenemos disponibilidad."
        )

    def test_list_messages_by_phone(self):
        url = reverse('whatsapp_messages')
        response = self.api_client.get(url, {'phone': '+56999999999'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]['text'], "Hola, ¿tienen hora para hoy?")

    def test_list_chats(self):
        url = reverse('whatsapp_chats')
        response = self.api_client.get(url, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['phone'], '+56999999999')
        self.assertEqual(response.data[0]['client']['name'], 'Diego Maradona')

    def test_send_manual_message_missing_params(self):
        url = reverse('whatsapp_send_manual')
        response = self.api_client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_send_manual_message_success(self):
        from unittest.mock import patch, MagicMock
        with patch('requests.post') as mock_post:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"success": True}
            mock_post.return_value = mock_response

            url = reverse('whatsapp_send_manual')
            data = {'phone': '+56999999999', 'text': 'Mensaje manual de prueba'}
            response = self.api_client.post(url, data, format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.data['text'], 'Mensaje manual de prueba')
            self.assertEqual(response.data['sender'], 'operator')


class MecaniaSecurityResilienceTestCase(TestCase):
    def setUp(self):
        self.api_client = APIClient()
        self.client_user = Client.objects.create(
            first_name="Juanito",
            last_name="Prez",
            phone="+56911112222",
            portal_enabled=True
        )
    
    def test_whatsapp_session_security_key(self):
        url = reverse('whatsapp_session')
        old_internal_key = getattr(settings, 'INTERNAL_API_KEY', None)
        settings.INTERNAL_API_KEY = "test-secret-key-12345"
        
        # Unauthorized request
        response = self.api_client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
        # Authorized request with incorrect key
        response = self.api_client.get(url, HTTP_X_MECANIA_SECRET_KEY="wrong-key")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
        # Authorized request with correct key
        response = self.api_client.get(url, HTTP_X_MECANIA_SECRET_KEY="test-secret-key-12345")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Restore settings
        settings.INTERNAL_API_KEY = old_internal_key

    def test_whatsapp_session_encryption_and_decryption(self):
        url = reverse('whatsapp_session')
        old_internal_key = getattr(settings, 'INTERNAL_API_KEY', None)
        settings.INTERNAL_API_KEY = "test-secret-key-12345"
        
        # Save a session
        post_data = {
            "key": "test_creds.json",
            "data": "my-secret-session-info-data-payload"
        }
        response = self.api_client.post(
            url, post_data, format='json', HTTP_X_MECANIA_SECRET_KEY="test-secret-key-12345"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["action"], "saved")
        
        # Verify it is encrypted in the database
        session_db = WhatsAppSession.objects.get(key="test_creds.json")
        self.assertNotEqual(session_db.data, "my-secret-session-info-data-payload")
        self.assertNotIn("my-secret-session-info-data-payload", session_db.data)
        
        # Verify it is decrypted when retrieved
        response_get = self.api_client.get(
            url, HTTP_X_MECANIA_SECRET_KEY="test-secret-key-12345"
        )
        self.assertEqual(response_get.status_code, status.HTTP_200_OK)
        self.assertEqual(response_get.data["test_creds.json"], "my-secret-session-info-data-payload")
        
        # Restore settings
        settings.INTERNAL_API_KEY = old_internal_key

    def test_whatsapp_manual_send_silences_bot(self):
        url = reverse('whatsapp_send_manual')
        
        from unittest.mock import patch, MagicMock
        with patch('requests.post') as mock_post:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"success": True}
            mock_post.return_value = mock_response
            
            # User must be authenticated to send manual message
            self.user = User.objects.create_superuser(
                username="tech1", email="tech1@example.com", password="password"
            )
            self.api_client.force_authenticate(user=self.user)
            
            # Initially not silenced
            self.assertFalse(self.client_user.bot_silenced_until and self.client_user.bot_silenced_until > timezone.now())
            
            # Send message
            data = {'phone': '+56911112222', 'text': 'Mensaje manual'}
            response = self.api_client.post(url, data, format='json')
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            
            # Refresh client, should be silenced now
            self.client_user.refresh_from_db()
            self.assertTrue(self.client_user.bot_silenced_until and self.client_user.bot_silenced_until > timezone.now())
            
            # Check silenced duration is about 2 hours
            time_diff = self.client_user.bot_silenced_until - timezone.now()
            self.assertTrue(timedelta(hours=1, minutes=58) < time_diff <= timedelta(hours=2))

    def test_whatsapp_agent_bot_silencing(self):
        url = reverse('ai-whatsapp-agent')
        old_internal_key = getattr(settings, 'INTERNAL_API_KEY', None)
        settings.INTERNAL_API_KEY = "test-secret-key-12345"
        
        # 1. Silenced client does not call OpenAI and return reply: None
        self.client_user.bot_silenced_until = timezone.now() + timedelta(hours=2)
        self.client_user.save()
        
        data = {
            'number': '+56911112222',
            'text': 'Hola bot silenciado'
        }
        # Call agent
        response = self.api_client.post(
            url, data, format='json', HTTP_X_MECANIA_SECRET_KEY="test-secret-key-12345"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data["reply"])
        
        # 2. Key check in WhatsAppAgentView
        response_auth = self.api_client.post(
            url, data, format='json', HTTP_X_MECANIA_SECRET_KEY="wrong-key"
        )
        self.assertEqual(response_auth.status_code, status.HTTP_403_FORBIDDEN)
        
        settings.INTERNAL_API_KEY = old_internal_key

    def test_whatsapp_logout_proxy(self):
        url = reverse('whatsapp_logout')
        from unittest.mock import patch, MagicMock
        with patch('requests.post') as mock_post:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_post.return_value = mock_resp
            
            # 1. Unauthenticated request should fail
            self.api_client.force_authenticate(user=None)  # Remove authentication
            response = self.api_client.post(url, format='json')
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
            
            # 2. Authenticated request sends key to whatsapp service
            user = User.objects.create_user(username="tech2", password="password")
            self.api_client.force_authenticate(user=user)
            
            old_internal_key = getattr(settings, 'INTERNAL_API_KEY', None)
            settings.INTERNAL_API_KEY = "test-secret-key-12345"
            
            try:
                response = self.api_client.post(url, format='json')
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(response.data["success"], True)
                
                # Verify Mock was called with correct header
                mock_post.assert_called_once()
                called_kwargs = mock_post.call_args[1]
                self.assertEqual(called_kwargs['headers']['X-Mecania-Secret-Key'], "test-secret-key-12345")
            finally:
                settings.INTERNAL_API_KEY = old_internal_key

class VisualInspectionPDFTestCase(TestCase):
    def setUp(self):
        self.api_client = APIClient()
        self.user = User.objects.create_user(
            username="mechanic1", 
            email="mech1@example.com", 
            password="pwd"
        )
        self.api_client.force_authenticate(user=self.user)
        
        self.client_user = Client.objects.create(
            first_name="Alfredo",
            last_name="Casero",
            phone="+56910101010",
        )
        
        self.vehicle = Vehicle.objects.create(
            license_plate="BBFF22",
            make="Ford",
            model="Fiesta",
            year=2015,
            client=self.client_user
        )
        
        self.inspection = VisualInspection.objects.create(
            vehicle=self.vehicle,
            mechanic=self.user,
            status='COMPLETED',
            notes="Observaciones generales de prueba",
            items_json={
                "engine": {"status": "OK", "note": "Todo bien"},
                "brakes": {"status": "CRITICAL", "note": "Pastillas desgastadas", "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="}
            }
        )

    def test_generate_pdf_success(self):
        url = reverse('visualinspection-generate-pdf', args=[self.inspection.id])
        response = self.api_client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertTrue(len(response.content) > 0)


class WhatsAppMessageSyncTestCase(TestCase):
    def setUp(self):
        self.api_client = APIClient()
        self.client_user = Client.objects.create(
            first_name="Juan",
            last_name="Perez",
            phone="+56911112222",
        )

    def test_whatsapp_message_sync(self):
        url = reverse('whatsapp_messages_sync')
        old_internal_key = getattr(settings, 'INTERNAL_API_KEY', None)
        settings.INTERNAL_API_KEY = "test-sync-key-999"

        try:
            # 1. Test unauthorized access
            data = {"messages": []}
            response = self.api_client.post(url, data, format='json')
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

            # 2. Test authorized bulk sync
            timestamp_unix = 1783307597
            messages = [
                {
                    "phone": "56911112222@s.whatsapp.net",
                    "text": "Hola, necesito sincronizar este mensaje",
                    "sender": "client",
                    "timestamp": timestamp_unix
                },
                {
                    "phone": "56911112222@s.whatsapp.net",
                    "text": "Respuesta sincronizada",
                    "sender": "assistant",
                    "timestamp": timestamp_unix + 10
                }
            ]

            response = self.api_client.post(
                url, 
                {"messages": messages}, 
                format='json',
                HTTP_X_MECANIA_SECRET_KEY="test-sync-key-999"
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.data["created"], 2)

            # Verify saved messages
            from operations.models import WhatsAppMessage
            db_messages = list(WhatsAppMessage.objects.filter(phone="+56911112222").order_by('timestamp'))
            self.assertEqual(len(db_messages), 2)
            self.assertEqual(db_messages[0].text, "Hola, necesito sincronizar este mensaje")
            self.assertEqual(db_messages[0].sender, "client")
            self.assertEqual(db_messages[0].client, self.client_user)

            import datetime
            dt_expected_0 = datetime.datetime.fromtimestamp(timestamp_unix, tz=datetime.timezone.utc)
            self.assertEqual(db_messages[0].timestamp, dt_expected_0)

            # 3. Test de-duplication (resending the same messages)
            response_dup = self.api_client.post(
                url, 
                {"messages": messages}, 
                format='json',
                HTTP_X_MECANIA_SECRET_KEY="test-sync-key-999"
            )
            self.assertEqual(response_dup.status_code, status.HTTP_200_OK)
            self.assertEqual(response_dup.data["created"], 0)

        finally:
            settings.INTERNAL_API_KEY = old_internal_key

