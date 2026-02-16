#!/bin/bash
# Script de backup automático para Operia PostgreSQL
# Ubicación: /usr/local/bin/backup-operia-db.sh

BACKUP_DIR="/home/ubuntu/backups"
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="operia_backup_$DATE.sql"
DB_USER="operia_user"
DB_NAME="operia_production"

# Crear directorio de backups si no existe
mkdir -p $BACKUP_DIR

# Realizar backup
echo "$(date): Iniciando backup de $DB_NAME..."
PGPASSWORD='operia_secure_2026!' pg_dump -U $DB_USER $DB_NAME > $BACKUP_DIR/$FILENAME

# Verificar si el backup fue exitoso
if [ $? -eq 0 ]; then
    echo "$(date): Backup creado exitosamente: $FILENAME"
    
    # Comprimir el backup
    gzip $BACKUP_DIR/$FILENAME
    echo "$(date): Backup comprimido: $FILENAME.gz"
    
    # Eliminar backups antiguos (más de 7 días)
    find $BACKUP_DIR -name "operia_backup_*.sql.gz" -mtime +7 -delete
    echo "$(date): Backups antiguos eliminados (>7 días)"
    
    # Mostrar tamaño del backup
    SIZE=$(du -h $BACKUP_DIR/$FILENAME.gz | cut -f1)
    echo "$(date): Tamaño del backup: $SIZE"
    
    # Contar backups existentes
    COUNT=$(ls -1 $BACKUP_DIR/operia_backup_*.sql.gz 2>/dev/null | wc -l)
    echo "$(date): Total de backups: $COUNT"
else
    echo "$(date): ERROR - Backup falló"
    exit 1
fi

echo "$(date): Backup completado"
