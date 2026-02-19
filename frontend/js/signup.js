// frontend/js/signup.js
// API Base URL  - cambiar según environment
const API_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:3000/api'
    : '/api';

// Referencias DOM
const signupForm = document.getElementById('signupForm');
const subdomainInput = document.getElementById('subdomain');
const subdomainStatus = document.getElementById('subdomainStatus');
const errorMessage = document.getElementById('errorMessage');
const submitBtn = document.getElementById('submitBtn');

let subdomainCheckTimeout;
let isSubdomainAvailable = false;

// Normalizar subdomain (solo minúsculas, números y guiones)
subdomainInput.addEventListener('input', (e) => {
    let value = e.target.value;
    value = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    e.target.value = value;

    // Debounce - esperar 500ms después de que el usuario deje de escribir
    clearTimeout(subdomainCheckTimeout);

    if (value.length >= 3) {
        subdomainStatus.className = 'subdomain-status checking';
        subdomainStatus.innerHTML = `
      <span class="loading-spinner"></span>
      <span class="message">Verificando disponibilidad...</span>
    `;

        subdomainCheckTimeout = setTimeout(() => {
            checkSubdomainAvailability(value);
        }, 500);
    } else {
        subdomainStatus.className = 'subdomain-status';
        subdomainStatus.innerHTML = `
      <span class="message">Debe tener al menos 3 caracteres</span>
    `;
        isSubdomainAvailable = false;
    }
});

// Verificar disponibilidad de subdomain
async function checkSubdomainAvailability(subdomain) {
    try {
        const response = await fetch(`${API_URL}/auth/check-subdomain/${subdomain}`);
        const data = await response.json();

        if (data.available) {
            subdomainStatus.className = 'subdomain-status available';
            subdomainStatus.innerHTML = `
        <span class="icon">✅</span>
        <span class="message">${data.preview_url} está disponible</span>
      `;
            isSubdomainAvailable = true;
        } else {
            subdomainStatus.className = 'subdomain-status unavailable';
            subdomainStatus.innerHTML = `
        <span class="icon">❌</span>
        <span class="message">${data.message}</span>
      `;
            isSubdomainAvailable = false;
        }
    } catch (error) {
        console.error('Error al verificar subdomain:', error);
        subdomainStatus.className = 'subdomain-status unavailable';
        subdomainStatus.innerHTML = `
      <span class="icon">⚠️</span>
      <span class="message">Error al verificar disponibilidad</span>
    `;
        isSubdomainAvailable = false;
    }
}

// Mostrar error
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('show');
    setTimeout(() => {
        errorMessage.classList.remove('show');
    }, 5000);
}

// Manejar envío de formulario
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Validar subdomain disponible
    if (!isSubdomainAvailable) {
        showError('Por favor, elige un subdomain válido y disponible');
        return;
    }

    // Deshabilitar botón y mostrar loading
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="loading-spinner"></span> Creando tu cuenta...';

    try {
        const formData = {
            company_name: document.getElementById('companyName').value,
            subdomain: document.getElementById('subdomain').value,
            user_name: document.getElementById('fullName').value, // Changed from full_name
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
            office: document.getElementById('office').value || ''
        };

        const response = await fetch(`${API_URL}/auth/signup-tenant`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || data.message || 'Error al crear la cuenta');
        }

        // Éxito - guardar token y redirigir
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('tenant', JSON.stringify(data.tenant));

        // Cookie para persistencia en subdominios
        document.cookie = `token=${data.token}; domain=.operia.cl; path=/; max-age=28800; Secure; SameSite=Lax`;

        // Mostrar mensaje de éxito
        submitBtn.innerHTML = '✅ ¡Cuenta creada! Redirigiendo...';
        submitBtn.style.background = '#27ae60';

        // Redirigir al onboarding en el subdominio
        const redirectUrl = `https://${data.tenant.subdomain}.operia.cl/onboarding.html`;

        setTimeout(() => {
            window.location.href = redirectUrl;
        }, 1500);

    } catch (error) {
        console.error('Error en signup:', error);
        showError(error.message);

        // Rehabilitar botón
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Crear mi Cuenta Gratis';
    }
});

// Prevenir envío del form con Enter en el campo de subdomain
// (para dar tiempo a que se verifique la disponibilidad)
subdomainInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (isSubdomainAvailable && subdomainInput.value.length >= 3) {
            document.getElementById('fullName').focus();
        }
    }
});
