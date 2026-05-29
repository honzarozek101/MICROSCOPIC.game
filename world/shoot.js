import { Oldbody } from "../Oldbody.js";
import { world } from "../worldState.js";
import { enforceProjectileLimit } from "./projectileLimit.js";

export function shootFromPlayer(targetX, targetY) {
  if (!world.player || world.player.absorbed) return;
  if (!world.player.canTakeActions?.()) return;

  if (world.player.canSplit()) {
    const split = world.player.split(targetX, targetY);

    if (split) {
      const currentPlayer = world.player;
      const oldbody = new Oldbody(
        currentPlayer.x,
        currentPlayer.y,
        currentPlayer.getSplitRadius(),
        {
          friction: 0.95,
          maxSpeed: 1,
          bounceForce: 1,
        }
      );

      oldbody.dx = 0;
      oldbody.dy = 0;

      currentPlayer.beginSplitTransfer(
        oldbody,
        split.angle + Math.PI,
        Math.cos(split.angle + Math.PI) * currentPlayer.clickForce,
        Math.sin(split.angle + Math.PI) * currentPlayer.clickForce
      );
      world.oldbodies.push(oldbody);
      return;
    }
  }

  const projectile = world.player.shoot(targetX, targetY);
  if (projectile) {
    world.particles.push(projectile);
    enforceProjectileLimit();
  }
}
