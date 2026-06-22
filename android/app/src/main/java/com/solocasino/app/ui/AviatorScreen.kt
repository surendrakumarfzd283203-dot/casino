package com.solocasino.app.ui

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun AviatorScreen(modifier: Modifier = Modifier) {
    var isFlying by remember { mutableStateOf(false) }
    val infiniteTransition = rememberInfiniteTransition(label = "plane_animation")

    // Multiplier animation
    val multiplier by animateFloatAsState(
        targetValue = if (isFlying) 100f else 1f,
        animationSpec = tween(durationMillis = 10000, easing = LinearEasing),
        label = "multiplier"
    )

    // Plane movement animations
    val planeX by animateFloatAsState(
        targetValue = if (isFlying) 500f else 0f,
        animationSpec = tween(durationMillis = 10000, easing = LinearEasing),
        label = "planeX"
    )
    
    val planeY by animateFloatAsState(
        targetValue = if (isFlying) -400f else 0f,
        animationSpec = tween(durationMillis = 10000, easing = LinearEasing),
        label = "planeY"
    )

    // Vibration/Engine shake
    val shake by infiniteTransition.animateFloat(
        initialValue = -2f,
        targetValue = 2f,
        animationSpec = infiniteRepeatable(
            animation = tween(50, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "shake"
    )

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black),
        contentAlignment = Alignment.Center
    ) {
        // Multiplier Display
        Text(
            text = "${"%.2f".format(if (isFlying) multiplier else 1.0f)}x",
            color = if (isFlying) Color(0xFFFF3D00) else Color.White,
            fontSize = 80.sp,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 100.dp)
        )

        // Plane Container
        Box(
            modifier = Modifier
                .size(300.dp)
                .graphicsLayer {
                    translationX = planeX
                    translationY = planeY + (if (isFlying) shake else 0f)
                    rotationZ = if (isFlying) -15f else 0f
                }
        ) {
            AviatorPlane(
                modifier = Modifier.fillMaxSize(),
                color = Color(0xFFE91E63),
                isPropellerSpinning = isFlying
            )
        }

        // Controls
        Button(
            onClick = { isFlying = !isFlying },
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 50.dp)
                .height(60.dp)
                .fillMaxWidth(0.8f),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (isFlying) Color.Red else Color(0xFF4CAF50)
            )
        ) {
            Text(
                text = if (isFlying) "CASH OUT" else "PLACE BET",
                fontSize = 20.sp,
                color = Color.White
            )
        }
    }
}

@Composable
fun AviatorPlane(
    modifier: Modifier = Modifier,
    color: Color = Color.Red,
    isPropellerSpinning: Boolean = false
) {
    val infiniteTransition = rememberInfiniteTransition(label = "propeller")
    val propellerScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 0.1f,
        animationSpec = infiniteRepeatable(
            animation = tween(50, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "propellerScale"
    )

    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height

        val planePath = Path().apply {
            // Tail Section
            moveTo(w * 0.05f, h * 0.4f)
            lineTo(w * 0.15f, h * 0.3f)
            lineTo(w * 0.2f, h * 0.3f)
            lineTo(w * 0.2f, h * 0.5f)
            lineTo(w * 0.05f, h * 0.4f)
            close()
            
            moveTo(w * 0.05f, h * 0.6f)
            lineTo(w * 0.15f, h * 0.7f)
            lineTo(w * 0.2f, h * 0.7f)
            lineTo(w * 0.2f, h * 0.5f)
            lineTo(w * 0.05f, h * 0.6f)
            close()

            // Fuselage Main Body
            moveTo(w * 0.18f, h * 0.44f)
            lineTo(w * 0.75f, h * 0.36f)
            lineTo(w * 0.85f, h * 0.5f)
            lineTo(w * 0.75f, h * 0.64f)
            lineTo(w * 0.18f, h * 0.56f)
            close()

            // Top Wing
            moveTo(w * 0.35f, h * 0.36f)
            lineTo(w * 0.55f, h * 0.1f)
            lineTo(w * 0.75f, h * 0.1f)
            lineTo(w * 0.65f, h * 0.36f)
            close()

            // Bottom Wing
            moveTo(w * 0.35f, h * 0.64f)
            lineTo(w * 0.55f, h * 0.9f)
            lineTo(w * 0.75f, h * 0.9f)
            lineTo(w * 0.65f, h * 0.64f)
            close()
        }

        drawPath(path = planePath, color = color)

        // Propeller
        val propHeight = 40.dp.toPx()
        val propWidth = 3.dp.toPx()
        val propX = w * 0.87f
        val propY = h * 0.5f
        
        val scale = if (isPropellerSpinning) propellerScale else 1f
        
        drawPath(
            path = Path().apply {
                moveTo(propX, propY - (propHeight / 2 * scale))
                lineTo(propX + propWidth, propY - (propHeight / 2 * scale))
                lineTo(propX + propWidth, propY + (propHeight / 2 * scale))
                lineTo(propX, propY + (propHeight / 2 * scale))
                close()
            },
            color = color
        )

        // The "X" Marking
        val xCenterX = w * 0.72f
        val xCenterY = h * 0.5f
        val xSize = 8.dp.toPx()
        
        drawPath(
            path = Path().apply {
                moveTo(xCenterX - xSize, xCenterY - xSize)
                lineTo(xCenterX + xSize, xCenterY + xSize)
                moveTo(xCenterX + xSize, xCenterY - xSize)
                lineTo(xCenterX - xSize, xCenterY + xSize)
            },
            color = Color.Black,
            style = Stroke(width = 3f)
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF000000)
@Composable
fun AviatorScreenPreview() {
    AviatorScreen()
}
