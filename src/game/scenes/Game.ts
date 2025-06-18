import { EventBus } from "../EventBus";
import { Scene } from "phaser";

// Define a type for projectiles with rectangle and direction
interface Projectile {
    rect: Phaser.GameObjects.Rectangle;
    dirX: number;
    dirY: number;
}

// Define a type for enemies with rectangle, speed, and hp
interface Enemy {
    rect: Phaser.GameObjects.Rectangle;
    speed: number;
    hp: number;
    hitTimer?: number; // For visual feedback
}

export class Game extends Scene {
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    gameText: Phaser.GameObjects.Text;
    playerControls: {
        down: Phaser.Input.Keyboard.Key;
        left: Phaser.Input.Keyboard.Key;
        right: Phaser.Input.Keyboard.Key;
        up: Phaser.Input.Keyboard.Key;
    };
    playerModel: Phaser.GameObjects.Rectangle;
    playerSpeed = 300;
    playerAcceleration = 1200; // pixels/sec^2
    playerFriction = 900; // pixels/sec^2
    playerPosition = {
        x: 0,
        y: 0,
    };
    playerVelocity = {
        x: 0,
        y: 0,
    };
    enemies: Enemy[] = [];
    enemyMovementSpeed = 100;
    playerColors = {
        default: 0x39ff14, // neon green
        highlight: 0xffff33, // neon yellow
    };
    playerProjectiles: Projectile[] = [];
    playerProjectileSpeed = 600; // pixels/sec
    projectileFireStamp = Date.now() + 1; // initial fire time, 3 seconds from now
    spawnTimestamp = Date.now() + 1; // initial spawn time, 3 seconds from now
    playerHp = 5;
    playerDamage = 2;
    playerInvulnerableUntil = 0; // timestamp in ms

    constructor() {
        super("Game");
    }

    create() {
        this.cameras.main.setBackgroundColor("#121212");
        this.setupPlayer();

        this.playerControls = this.input.keyboard!.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            right: Phaser.Input.Keyboard.KeyCodes.D,
        }) as any;

        EventBus.emit("current-scene-ready", this);
    }
    setupPlayer() {
        this.playerPosition = {
            x: this.cameras.main.centerX,
            y: this.cameras.main.centerY,
        };
        this.playerVelocity = { x: 0, y: 0 };

        this.playerModel = this.add.rectangle(
            this.playerPosition.x,
            this.playerPosition.y,
            35,
            35,
            0x39ff14 // neon green
        );
        this.playerModel.setDepth(10); // Ensure player is above other objects
    }
    update() {
        this.updatePlayerPosition();
        this.spawnEnemyAtRandomPosition();
        this.moveEnemiesTowardPlayer();
        this.checkCollisionWithEnemies();
        this.fireProjectile();
        this.moveProjectiles();
        // Update logic for the game scene can be added here
    }
    updatePlayerPosition() {
        const delta = this.game.loop.delta / 1000;
        let moveX = 0;
        let moveY = 0;
        if (this.playerControls.up.isDown) moveY -= 1;
        if (this.playerControls.down.isDown) moveY += 1;
        if (this.playerControls.left.isDown) moveX -= 1;
        if (this.playerControls.right.isDown) moveX += 1;

        // Normalize diagonal movement
        if (moveX !== 0 && moveY !== 0) {
            const norm = Math.sqrt(2) / 2;
            moveX *= norm;
            moveY *= norm;
        }

        // Accelerate towards input direction
        if (moveX !== 0 || moveY !== 0) {
            this.playerVelocity.x += moveX * this.playerAcceleration * delta;
            this.playerVelocity.y += moveY * this.playerAcceleration * delta;
            // Clamp velocity to max speed
            const speed = Math.sqrt(
                this.playerVelocity.x ** 2 + this.playerVelocity.y ** 2
            );
            if (speed > this.playerSpeed) {
                const scale = this.playerSpeed / speed;
                this.playerVelocity.x *= scale;
                this.playerVelocity.y *= scale;
            }
        } else {
            // Apply friction to slow down
            const vx = this.playerVelocity.x;
            const vy = this.playerVelocity.y;
            const v = Math.sqrt(vx * vx + vy * vy);
            if (v > 0) {
                const decel = this.playerFriction * delta;
                const newV = Math.max(0, v - decel);
                if (newV === 0) {
                    this.playerVelocity.x = 0;
                    this.playerVelocity.y = 0;
                } else {
                    const scale = newV / v;
                    this.playerVelocity.x *= scale;
                    this.playerVelocity.y *= scale;
                }
            }
        }

        // Update position
        this.playerPosition.x += this.playerVelocity.x * delta;
        this.playerPosition.y += this.playerVelocity.y * delta;

        this.playerModel.setPosition(
            this.playerPosition.x,
            this.playerPosition.y
        );
    }

    spawnEnemyAtRandomPosition() {
        if (this.enemies.length === 5) {
            return;
        }
        const now = new Date();
        if (now.getTime() > this.spawnTimestamp) {
            this.spawnTimestamp = now.getTime() + 1000; // amount in ms, 1000 = 1 second
            // Choose a random border: 0=top, 1=bottom, 2=left, 3=right
            const border = Phaser.Math.Between(0, 3);
            let x = 0,
                y = 0;
            if (border === 0) {
                // Top
                x = Phaser.Math.Between(0, this.cameras.main.width);
                y = 0;
            } else if (border === 1) {
                // Bottom
                x = Phaser.Math.Between(0, this.cameras.main.width);
                y = this.cameras.main.height;
            } else if (border === 2) {
                // Left
                x = 0;
                y = Phaser.Math.Between(0, this.cameras.main.height);
            } else if (border === 3) {
                // Right
                x = this.cameras.main.width;
                y = Phaser.Math.Between(0, this.cameras.main.height);
            }
            const rect = this.add.rectangle(x, y, 25, 25, 0xff073a); // neon red
            const speed = 200; // pixels/sec
            const hp = 5; // Enemy HP
            this.enemies.push({ rect, speed, hp });
        }
    }

    /**
     * Moves all enemies toward the player's current position.
     * Handles visual feedback for hit effect.
     */
    moveEnemiesTowardPlayer() {
        const delta = this.game.loop.delta / 1000;
        for (const enemy of this.enemies) {
            // Visual feedback: if hitTimer is active, flash color
            if (enemy.hitTimer && enemy.hitTimer > 0) {
                enemy.hitTimer -= delta;
                enemy.rect.setFillStyle(0xffff33); // flash yellow
                if (enemy.hitTimer <= 0) {
                    enemy.rect.setFillStyle(0xff073a); // back to red
                    enemy.hitTimer = 0;
                }
            }
            // Move toward player
            const ex = enemy.rect.x;
            const ey = enemy.rect.y;
            const px = this.playerPosition.x;
            const py = this.playerPosition.y;
            const dx = px - ex;
            const dy = py - ey;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0) {
                const dirX = dx / dist;
                const dirY = dy / dist;
                enemy.rect.x += dirX * enemy.speed * delta;
                enemy.rect.y += dirY * enemy.speed * delta;
            }
        }
    }

    checkCollisionWithEnemies() {
        for (const enemy of this.enemies) {
            const enemyPosition = enemy.rect.getBounds();
            const playerPosition = this.playerModel.getBounds();
            if (
                Phaser.Geom.Intersects.RectangleToRectangle(
                    playerPosition,
                    enemyPosition
                )
            ) {
                // Only take damage if not invulnerable
                const now = Date.now();
                if (now >= this.playerInvulnerableUntil) {
                    this.playerHp -= 1;
                    this.playerInvulnerableUntil = now + 1000; // 1 second invulnerability
                    this.playerModel.setFillStyle(this.playerColors.highlight);
                    console.log("Player hit! HP:", this.playerHp);
                }
                // Handle collision logic here, e.g., reset player position or reduce health
                return;
            } else {
                // Only reset color if not invulnerable
                if (Date.now() >= this.playerInvulnerableUntil) {
                    this.playerModel.setFillStyle(this.playerColors.default);
                }
            }
        }
    }

    onPlayerHit(enemy: Enemy) {
        this.playerModel.setFillStyle(this.playerColors.highlight); // Highlight player on hit
        // Handle player hit logic, e.g., reduce health, play sound, etc.
        this.playerHp -= enemy.hp; // Example: reduce player HP by enemy's HP
        console.log("Player hit! Remaining HP:", this.playerHp);
        if (this.playerHp <= 0) {
            console.log("Game Over!");
            // Handle game over logic here, e.g., restart game or show game over screen
        }
    }

    /**
     * Fires a projectile from the player's position towards the closest enemy.
     * Each projectile stores its direction vector (dirX, dirY) for movement.
     * If no enemies exist, no projectile is fired.
     */
    fireProjectile() {
        const now = Date.now();
        if (now < this.projectileFireStamp) {
            return; // Prevent firing if cooldown is active
        }
        this.projectileFireStamp = now + 1000; // 1 second cooldown

        // Find the closest enemy
        if (this.enemies.length === 0) {
            return; // No target to fire at
        }
        let closestEnemy = this.enemies[0];
        let minDistSq = Number.POSITIVE_INFINITY;
        const px = this.playerPosition.x;
        const py = this.playerPosition.y;
        for (const enemy of this.enemies) {
            const ex = enemy.rect.x;
            const ey = enemy.rect.y;
            const distSq = (ex - px) * (ex - px) + (ey - py) * (ey - py);
            if (distSq < minDistSq) {
                minDistSq = distSq;
                closestEnemy = enemy;
            }
        }
        // Calculate normalized direction vector from player to closest enemy
        const dx = closestEnemy.rect.x - px;
        const dy = closestEnemy.rect.y - py;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) {
            return; // Avoid division by zero
        }
        const dirX = dx / len;
        const dirY = dy / len;

        // Create projectile at player's position
        const rect = this.add.rectangle(
            px,
            py,
            10,
            10,
            0xffffff // white
        );
        // Store projectile as an object with rect and direction
        this.playerProjectiles.push({ rect, dirX, dirY });
    }
    /**
     * Moves all projectiles using their stored direction (dirX, dirY).
     * Removes projectiles if they go out of bounds or hit an enemy.
     * Applies damage to enemies and visual feedback.
     */
    moveProjectiles() {
        const delta = this.game.loop.delta / 1000;
        for (const projectile of [...this.playerProjectiles]) {
            projectile.rect.x +=
                projectile.dirX * this.playerProjectileSpeed * delta;
            projectile.rect.y +=
                projectile.dirY * this.playerProjectileSpeed * delta;
            // Remove if out of bounds
            if (
                projectile.rect.x < 0 ||
                projectile.rect.x > this.cameras.main.width ||
                projectile.rect.y < 0 ||
                projectile.rect.y > this.cameras.main.height
            ) {
                projectile.rect.destroy();
                this.playerProjectiles = this.playerProjectiles.filter(
                    (p) => p !== projectile
                );
                continue;
            }
            // Check collision with enemies
            for (const enemy of this.enemies) {
                const enemyPosition = enemy.rect.getBounds();
                const projectilePosition = projectile.rect.getBounds();
                if (
                    Phaser.Geom.Intersects.RectangleToRectangle(
                        projectilePosition,
                        enemyPosition
                    )
                ) {
                    // Collision detected: apply damage
                    enemy.hp -= this.playerDamage;
                    enemy.hitTimer = 0.1; // flash for 0.1 seconds
                    // Remove projectile
                    projectile.rect.destroy();
                    this.playerProjectiles = this.playerProjectiles.filter(
                        (p) => p !== projectile
                    );
                    // Remove enemy if HP <= 0
                    if (enemy.hp <= 0) {
                        enemy.rect.destroy();
                        this.enemies = this.enemies.filter((e) => e !== enemy);
                        console.log("Enemy killed!");
                    } else {
                        console.log("Enemy hit! HP:", enemy.hp);
                    }
                    break;
                }
            }
        }
    }
}
