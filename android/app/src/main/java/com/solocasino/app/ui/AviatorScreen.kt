package com.solocasino.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

@Composable
fun AviatorScreen(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black),
        contentAlignment = Alignment.Center
    ) {
        AviatorPlane(
            modifier = Modifier.size(300.dp),
            color = Color(0xFFFF0000) // Pure Red
        )
    }
}

@Composable
fun AviatorPlane(
    modifier: Modifier = Modifier,
    color: Color = Color.Red
) {
    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height

        val planePath = Path().apply {
            // Main fuselage
            moveTo(w * 0.15f, h * 0.52f)
            lineTo(w * 0.75f, h * 0.52f)
            lineTo(w * 0.85f, h * 0.5f) // Nose
            lineTo(w * 0.75f, h * 0.48f)
            lineTo(w * 0.15f, h * 0.48f)
            close()

            // Top wing - swept back
            moveTo(w * 0.35f, h * 0.48f)
            lineTo(w * 0.45f, h * 0.3f)
            lineTo(w * 0.75f, h * 0.3f)
            lineTo(w * 0.65f, h * 0.48f)
            close()

            // Bottom wing - swept back
            moveTo(w * 0.35f, h * 0.52f)
            lineTo(w * 0.45f, h * 0.7f)
            lineTo(w * 0.75f, h * 0.7f)
            lineTo(w * 0.65f, h * 0.52f)
            close()

            // Tail - split
            moveTo(w * 0.2f, h * 0.48f)
            lineTo(w * 0.1f, h * 0.38f)
            lineTo(w * 0.2f, h * 0.38f)
            lineTo(w * 0.25f, h * 0.48f)
            close()
            
            moveTo(w * 0.2f, h * 0.52f)
            lineTo(w * 0.1f, h * 0.62f)
            lineTo(w * 0.2f, h * 0.62f)
            lineTo(w * 0.25f, h * 0.52f)
            close()
        }

        drawPath(path = planePath, color = color)

        // Propeller
        val propellerPath = Path().apply {
            moveTo(w * 0.85f, h * 0.25f)
            quadraticTo(w * 0.87f, h * 0.2f, w * 0.89f, h * 0.25f)
            lineTo(w * 0.89f, h * 0.75f)
            quadraticTo(w * 0.87f, h * 0.8f, w * 0.85f, h * 0.75f)
            close()
        }
        drawPath(path = propellerPath, color = color)

        // The "X" detail on the fuselage
        val xSize = w * 0.05f
        val centerX = w * 0.7f
        val centerY = h * 0.5f
        
        drawPath(
            path = Path().apply {
                moveTo(centerX - xSize, centerY - xSize)
                lineTo(centerX + xSize, centerY + xSize)
                moveTo(centerX + xSize, centerY - xSize)
                lineTo(centerX - xSize, centerY + xSize)
            },
            color = Color.Black,
            style = Stroke(width = 4f)
        )
    }
}

@Preview(showBackground = true, backgroundColor = 0xFF000000)
@Composable
fun AviatorScreenPreview() {
    AviatorScreen()
}
