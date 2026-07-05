from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from django.contrib.auth.models import User
from operations.models import Client, WhatsAppMessage
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
