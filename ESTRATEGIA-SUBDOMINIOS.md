# 🌐 ESTRATEGIA DE SUBDOMINIOS PARA OPERIA

## 📋 RESUMEN

Tienes **3 opciones** para implementar el sistema multi-tenant con subdominios. Te explico cada una con sus pros y contras.

---

## OPCIÓN 1: Usar tu dominio existente synapsedev.cl ✅ RECOMENDADO

### Cómo funciona:
```
Landing:           https://synapsedev.cl/operia
Signup:            https://synapsedev.cl/operia/signup
Tenant "acme":     https://acme.synapsedev.cl
Tenant "biocare":  https://biocare.synapsedev.cl
```

### Ventajas:
- ✅ **NO necesitas comprar dominio nuevo**
- ✅ Ya tienes synapsedev.cl funcionando
- ✅ Puedes empezar inmediatamente
- ✅ Más económico (no pagas dominio extra)
- ✅ Aprovechas el SEO de synapsedev.cl

### Desventajas:
- ⚠️ Los clientes verán "synapsedev.cl" en la URL
- ⚠️ Menos profesional para el producto

### Configuración DNS necesaria:
```
# En tu panel de DNS de synapsedev.cl
*.synapsedev.cl  →  A  →  IP_SERVIDOR
```

### Costo:
- **$0** (ya tienes el dominio)

---

## OPCIÓN 2: Comprar operia.cl en NIC Chile 💰

### Cómo funciona:
```
Landing:           https://operia.cl
Signup:            https://operia.cl/signup
Tenant "acme":     https://acme.operia.cl
Tenant "biocare":  https://biocare.operia.cl
```

### Ventajas:
- ✅ Marca propia y profesional
- ✅ URL limpia para clientes
- ✅ Mejor para marketing
- ✅ Más credibilidad

### Desventajas:
- ⚠️ Debes comprar el dominio (~$10.000 CLP/año)
- ⚠️ Proceso de compra en NIC Chile (1-2 días)
- ⚠️ Configuración DNS adicional

### Pasos para comprar:
1. Ir a https://www.nic.cl
2. Buscar "operia.cl"
3. Si está disponible, comprarlo (~$10.000 CLP/año)
4. Configurar DNS wildcard

### Configuración DNS necesaria:
```
# En panel de NIC Chile
*.operia.cl  →  A  →  IP_SERVIDOR
operia.cl    →  A  →  IP_SERVIDOR
```

### Costo:
- **~$10.000 CLP/año** (dominio .cl)

---

## OPCIÓN 3: Usar subdominio de synapsedev.cl (Híbrido) 🎯 MEJOR OPCIÓN

### Cómo funciona:
```
Landing:           https://synapsedev.cl/operia
Signup:            https://app.synapsedev.cl/operia/signup
Tenant "acme":     https://acme-operia.synapsedev.cl
Tenant "biocare":  https://biocare-operia.synapsedev.cl
```

### Ventajas:
- ✅ **NO necesitas comprar dominio**
- ✅ Separación clara entre landing y app
- ✅ Puedes empezar inmediatamente
- ✅ Económico
- ✅ Profesional

### Desventajas:
- ⚠️ URLs un poco más largas
- ⚠️ Clientes ven "synapsedev.cl"

### Configuración DNS necesaria:
```
# En tu panel de DNS de synapsedev.cl
*-operia.synapsedev.cl  →  A  →  IP_SERVIDOR
app.synapsedev.cl       →  A  →  IP_SERVIDOR
```

### Costo:
- **$0** (ya tienes el dominio)

---

## 🎯 MI RECOMENDACIÓN: OPCIÓN 3 (Híbrido)

### ¿Por qué?

1. **Costo $0** - No necesitas comprar dominio nuevo
2. **Profesional** - Separación clara entre landing y app
3. **Inmediato** - Puedes empezar hoy mismo
4. **Escalable** - Después puedes migrar a operia.cl si quieres

### Implementación:

**Landing page:**
```
https://synapsedev.cl/operia
```

**Aplicación:**
```
https://app.synapsedev.cl/operia/signup  (signup)
https://acme-operia.synapsedev.cl        (tenant acme)
https://biocare-operia.synapsedev.cl     (tenant biocare)
```

---

## 📝 CONFIGURACIÓN PASO A PASO (OPCIÓN 3)

### 1. Configurar DNS en synapsedev.cl

En tu proveedor de DNS (donde tienes synapsedev.cl):

```
Tipo: A
Host: app
Valor: IP_DE_TU_SERVIDOR
TTL: 3600

Tipo: A
Host: *-operia
Valor: IP_DE_TU_SERVIDOR
TTL: 3600
```

### 2. Actualizar .env

```env
APP_DOMAIN=synapsedev.cl
SUBDOMAIN_SUFFIX=-operia
```

### 3. Actualizar código

Modificar `backend/middleware/tenant.middleware.js`:

```javascript
function extractTenant(req, res, next) {
    const host = req.get('host') || '';
    
    // Extraer subdomain
    // Ejemplo: acme-operia.synapsedev.cl → acme
    const parts = host.split('.');
    let subdomain = parts[0];
    
    // Remover sufijo -operia si existe
    if (subdomain.endsWith('-operia')) {
        subdomain = subdomain.replace('-operia', '');
    }
    
    // ... resto del código
}
```

### 4. Actualizar signup

En `frontend/signup.html`, mostrar:
```
Tu URL será: https://[subdomain]-operia.synapsedev.cl
```

---

## 🔄 MIGRACIÓN FUTURA A operia.cl

Si después decides comprar operia.cl, la migración es simple:

### Paso 1: Comprar dominio
- Ir a NIC Chile
- Comprar operia.cl

### Paso 2: Configurar DNS
```
*.operia.cl  →  A  →  IP_SERVIDOR
operia.cl    →  A  →  IP_SERVIDOR
```

### Paso 3: Actualizar .env
```env
APP_DOMAIN=operia.cl
SUBDOMAIN_SUFFIX=
```

### Paso 4: Notificar clientes
- Enviar email con nueva URL
- Mantener redirección desde URLs antiguas

---

## 💰 COMPARACIÓN DE COSTOS

| Opción | Costo Inicial | Costo Anual | Tiempo Setup |
|--------|---------------|-------------|--------------|
| Opción 1 (synapsedev.cl) | $0 | $0 | 1 hora |
| Opción 2 (operia.cl) | $10.000 | $10.000 | 2-3 días |
| Opción 3 (Híbrido) | $0 | $0 | 2 horas |

---

## 🚀 PLAN DE ACCIÓN RECOMENDADO

### Fase 1: Lanzamiento (Hoy - Semana 1)
- ✅ Usar Opción 3 (Híbrido con synapsedev.cl)
- ✅ Configurar DNS
- ✅ Deploy a producción
- ✅ Testing con primeros clientes

### Fase 2: Validación (Semana 2-4)
- Obtener feedback de usuarios
- Validar modelo de negocio
- Conseguir primeros clientes pagos

### Fase 3: Escalamiento (Mes 2+)
- Si el producto funciona bien
- Comprar operia.cl
- Migrar gradualmente

---

## ❓ PREGUNTAS FRECUENTES

### ¿Necesito comprar operia.cl ahora?
**No.** Puedes empezar con synapsedev.cl y comprar operia.cl después si el producto tiene tracción.

### ¿Los clientes verán "synapsedev.cl"?
**Sí**, pero con la Opción 3 verán URLs como `acme-operia.synapsedev.cl`, que es profesional.

### ¿Puedo cambiar después?
**Sí**, la migración es simple. Solo cambias DNS y .env.

### ¿Cuánto cuesta operia.cl?
**~$10.000 CLP/año** en NIC Chile.

### ¿Qué pasa si operia.cl no está disponible?
Puedes usar:
- `operia.app` (dominio internacional, ~$15 USD/año)
- `getoperia.cl`
- `operia.io`
- O quedarte con synapsedev.cl

---

## 🎯 DECISIÓN FINAL

**Te recomiendo empezar con Opción 3 (Híbrido):**

1. **Hoy:** Configurar DNS en synapsedev.cl
2. **Esta semana:** Deploy a producción
3. **Próximas semanas:** Validar con usuarios
4. **Si funciona bien:** Comprar operia.cl y migrar

**Ventajas:**
- ✅ Costo $0
- ✅ Puedes empezar hoy
- ✅ Profesional
- ✅ Fácil de migrar después

---

**¿Quieres que implemente la Opción 3 ahora?** 🚀
