const db = require('../database/db');
const { v4: uuidv4 } = require('uuid');

/**
 * Record an inventory movement and update current product stock
 */
function recordMovement({ productId, batchId = null, movementType, quantity, referenceType, referenceId, notes = '', createdBy = null }) {
    const productStmt = db.prepare('SELECT current_stock FROM products WHERE id = ?');
    const product = productStmt.get(productId);
    
    if (!product) {
        throw new Error(`Product not found: ${productId}`);
    }
    
    const currentStock = product.current_stock || 0;
    const newStock = currentStock + quantity;
    
    // Update product stock
    db.prepare('UPDATE products SET current_stock = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newStock, productId);
    
    // Insert movement record
    const movementId = uuidv4();
    db.prepare(`
        INSERT INTO inventory_movements 
        (id, product_id, batch_id, movement_type, quantity, balance_after, reference_type, reference_id, notes, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        movementId,
        productId,
        batchId,
        movementType,
        quantity,
        newStock,
        referenceType,
        referenceId,
        notes,
        createdBy
    );
    
    return {
        movementId,
        previousStock: currentStock,
        newStock,
        movementType,
        quantity
    };
}

module.exports = {
    recordMovement
};
