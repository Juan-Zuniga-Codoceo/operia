#!/bin/bash

# Script para instalar y configurar PostgreSQL en Oracle Cloud
# Ejecutar con sudo: sudo bash setup-postgresql.sh

echo "🚀 Iniciando instalación de PostgreSQL..."

# Actualizar paquetes
apt update

# Instalar PostgreSQL
apt install -y postgresql postgresql-contrib

# Iniciar servicio
systemctl start postgresql
systemctl enable postgresql

echo "✅ PostgreSQL instalado y ejecutándose"

# Crear base de datos y usuario
sudo -u postgres psql <<EOF
-- Crear base de datos
CREATE DATABASE operia_production;

-- Crear usuario
CREATE USER operia_user WITH ENCRYPTED PASSWORD 'operia_secure_2026!';

-- Otorgar privilegios
GRANT ALL PRIVILEGES ON DATABASE operia_production TO operia_user;

-- Configuración adicional para el usuario
ALTER USER operia_user CREATEDB;

\c operia_production

-- Otorgar permisos en el schema public
GRANT ALL ON SCHEMA public TO operia_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO operia_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO operia_user;

-- Configurar permisos por defecto
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO operia_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO operia_user;

EOF

echo "✅ Base de datos 'operia_production' y usuario 'operia_user' creados"

# Configurar PostgreSQL para aceptar conexiones de red (si es necesario)
PG_HBA="/etc/postgresql/$(ls /etc/postgresql)/main/pg_hba.conf"
echo "host    all             all             0.0.0.0/0               md5" >> $PG_HBA

PG_CONF="/etc/postgresql/$(ls /etc/postgresql)/main/postgresql.conf"
sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" $PG_CONF

# Reiniciar PostgreSQL
systemctl restart postgresql

echo "✅ PostgreSQL configurado para aceptar conexiones remotas"
echo ""
echo "📋 Detalles de conexión:"
echo "   Host: localhost (o IP del servidor)"
echo "   Puerto: 5432"
echo "   Base de datos: operia_production"
echo "   Usuario: operia_user"
echo "   Password: operia_secure_2026!"
echo ""
echo "🔗 String de conexión:"
echo "   postgresql://operia_user:operia_secure_2026!@localhost:5432/operia_production"
echo ""
echo "✅ Instalación completada!"
