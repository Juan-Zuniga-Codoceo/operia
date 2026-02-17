// js/auth.js
const { createApp, ref } = Vue;

// === LOGIN ===
if (document.getElementById('login-app')) {
  // Si ya está logueado, redirigir
  if (sessionStorage.getItem('auth_token')) {
    window.location.href = '/tablero.html';
  }

  createApp({
    setup() {
      const email = ref('');
      const password = ref('');
      const loading = ref(false);
      const error = ref('');

      const passwordFieldType = ref('password');

      const togglePasswordVisibility = () => {
        passwordFieldType.value = passwordFieldType.value === 'password' ? 'text' : 'password';
      };

      const login = async () => {
        error.value = '';
        loading.value = true;

        try {
          // Lógica para obtener el subdominio (Tenant)
          const hostname = window.location.hostname;
          let subdomain = null;

          // Asumiendo estructura: cliente.operia.cl
          const parts = hostname.split('.');
          if (hostname !== 'localhost' && !hostname.includes('127.0.0.1')) {
            if (parts.length >= 3) {
              subdomain = parts[0];
            }
          }

          // Si estamos en el dominio raíz (operia.cl), el subdominio es null.
          // El backend debe manejar esto (posiblemente solo permitiendo admin global).

          const res = await fetch('/api/auth/login', { // <-- CORREGIDO: /api/auth/login
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: email.value,
              password: password.value,
              subdomain: subdomain // <-- ENVIAMOS EL SUBDOMINIO
            })
          });

          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || 'Credenciales inválidas');
          }

          const data = await res.json();

          if (!data.user || !data.token) {
            throw new Error('Respuesta del servidor inválida');
          }

          // Guardar sesión
          sessionStorage.setItem('biocare_user', JSON.stringify(data.user));
          sessionStorage.setItem('auth_token', data.token);

          // Redirigir
          window.location.href = '/tablero.html';
        } catch (err) {
          error.value = err.message || 'Error de conexión. Intenta nuevamente.';
          console.error('Error en login:', err);
        } finally {
          loading.value = false;
        }
      };

      return { email, password, loading, error, login, passwordFieldType, togglePasswordVisibility };
    }
  }).mount('#login-app');
}

// === REGISTRO ===
if (document.getElementById('register-app')) {
  createApp({
    setup() {
      const name = ref('');
      const email = ref('');
      const password = ref('');
      const confirmPassword = ref('');
      const office = ref('');
      const loading = ref(false);
      const error = ref('');
      const success = ref('');

      const isValidEmail = (email) => {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
      };

      const validateForm = () => {
        if (!name.value.trim()) {
          return 'El nombre es obligatorio';
        }
        if (!email.value.trim() || !isValidEmail(email.value)) {
          return 'Ingresa un correo válido';
        }
        if (password.value.length < 6) {
          return 'La contraseña debe tener al menos 6 caracteres';
        }
        if (password.value !== confirmPassword.value) {
          return 'Las contraseñas no coinciden';
        }
        if (!office.value) {
          return 'Selecciona una oficina';
        }
        return null;
      };

      const registrar = async () => {
        const validationError = validateForm();
        if (validationError) {
          error.value = validationError;
          return;
        }

        error.value = '';
        success.value = '';
        loading.value = true;

        try {
          const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              name: name.value.trim(),
              email: email.value.trim(),
              password: password.value,
              office: office.value
            })
          });

          const data = await res.json();

          if (res.ok) {
            success.value = 'Cuenta creada exitosamente. Redirigiendo al login...';
            // Limpiar formulario
            name.value = '';
            email.value = '';
            password.value = '';
            confirmPassword.value = '';
            office.value = '';

            setTimeout(() => {
              window.location.href = '/login.html';
            }, 2000);
          } else {
            error.value = data.error || 'No se pudo crear la cuenta. Intenta con otro correo.';
          }
        } catch (err) {
          error.value = 'Error de conexión. Intenta nuevamente.';
          console.error('Error en registro:', err);
        } finally {
          loading.value = false;
        }
      };

      return {
        name,
        email,
        password,
        confirmPassword,
        office,
        loading,
        error,
        success,
        registrar
      };
    }
  }).mount('#register-app');
}