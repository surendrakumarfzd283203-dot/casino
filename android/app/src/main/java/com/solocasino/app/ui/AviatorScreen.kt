package com.solocasino.app.ui

import androidx.compose.animation.core.*
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage

@Composable
fun AviatorScreen(modifier: Modifier = Modifier) {
    var isFlying by remember { mutableStateOf(false) }
    var currentMultiplier by remember { mutableFloatStateOf(1.0f) }
    val startTime = remember { mutableLongStateOf(0L) }

    LaunchedEffect(isFlying) {
        if (isFlying) {
            startTime.value = System.currentTimeMillis()
            while (isFlying) {
                val elapsed = (System.currentTimeMillis() - startTime.value) / 1000f
                currentMultiplier = Math.pow(1.1, elapsed.toDouble()).toFloat()
                kotlinx.coroutines.delay(50)
            }
        } else {
            currentMultiplier = 1.0f
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF121314))
    ) {
        // Top Bar
        AviatorHeader()

        // History Bar
        HistoryBar()

        // Game Area
        GameArea(isFlying, currentMultiplier)

        // Betting Controls
        BettingSection(isFlying, currentMultiplier)

        // Stats Section
        StatsSection()
    }
}

@Composable
fun AviatorHeader() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color(0xFF1B1C1D))
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "Aviator",
            color = Color(0xFFD10214),
            fontSize = 20.sp,
            fontWeight = FontWeight.Black,
            fontStyle = androidx.compose.ui.text.font.FontStyle.Italic
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "58.77 INR",
                color = Color(0xFF28A745),
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.width(12.dp))
            Icon(
                painter = painterResource(android.R.drawable.ic_menu_sort_by_size), // Placeholder
                contentDescription = "Menu",
                tint = Color.LightGray
            )
        }
    }
}

@Composable
fun HistoryBar() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.Black)
            .padding(8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        val history = listOf(1.25f, 2.88f, 1.83f, 2.38f, 28.88f, 1.14f)
        history.forEach { mult ->
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color(0xFF212429))
                    .padding(horizontal = 10.dp, vertical = 2.dp)
            ) {
                Text(
                    text = "${mult}x",
                    color = if (mult > 10) Color(0xFFC017B2) else if (mult > 2) Color(0xFF913EF8) else Color(0xFF34B4FF),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
fun GameArea(isFlying: Boolean, multiplier: Float) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(260.dp)
            .padding(8.dp)
            .clip(RoundedCornerShape(15.dp))
            .background(Color.Black)
    ) {
        // Sunburst Background
        Canvas(modifier = Modifier.fillMaxSize()) {
            val center = Offset(0f, size.height)
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(Color(0xFF1A1A1A), Color.Black),
                    center = center,
                    radius = size.width * 1.5f
                ),
                center = center,
                radius = size.width * 1.5f
            )
            // Lines could be drawn here for sunburst effect
        }

        if (!isFlying) {
            Text(
                text = "WAITING FOR NEXT ROUND",
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFF5A623))
                    .padding(vertical = 2.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                fontSize = 11.sp,
                fontWeight = FontWeight.Black,
                color = Color.Black
            )
        }

        // Multiplier
        Text(
            text = "${"%.2f".format(multiplier)}x",
            color = Color.White,
            fontSize = 60.sp,
            fontWeight = FontWeight.Black,
            modifier = Modifier.align(Alignment.Center)
        )

        // Flight Path & Plane
        if (isFlying) {
            FlightAnimation(multiplier)
        }

        // Player Overlay
        Row(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(bottom = 30.dp, end = 20.dp)
                .background(Color.Black.copy(alpha = 0.6f), RoundedCornerShape(20.dp))
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            repeat(3) {
                Box(
                    modifier = Modifier
                        .size(20.dp)
                        .offset(x = (-it * 8).dp)
                        .clip(CircleShape)
                        .background(Color.Gray)
                )
            }
            Text("232", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun FlightAnimation(multiplier: Float) {
    // This would use Canvas to draw the curve and animate the plane
    Canvas(modifier = Modifier.fillMaxSize()) {
        val t = (multiplier - 1f) * 20f // scale factor
        val path = Path().apply {
            moveTo(40.dp.toPx(), size.height - 40.dp.toPx())
            quadraticBezierTo(
                size.width / 2, size.height - 40.dp.toPx(),
                40.dp.toPx() + t * 10f, size.height - 40.dp.toPx() - t * 5f
            )
        }
        drawPath(path, color = Color(0xFFD10214), style = Stroke(width = 4.dp.toPx()))
    }
}

@Composable
fun BettingSection(isFlying: Boolean, multiplier: Float) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(10.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        BetCard(modifier = Modifier.weight(1f), isFlying, multiplier)
        BetCard(modifier = Modifier.weight(1f), isFlying, multiplier)
    }
}

@Composable
fun BetCard(modifier: Modifier, isFlying: Boolean, multiplier: Float) {
    Column(
        modifier = modifier
            .background(Color(0xFF1B1C1D), RoundedCornerShape(15.dp))
            .border(1.dp, Color(0xFF222222), RoundedCornerShape(15.dp))
            .padding(10.dp)
    ) {
        // Tabs
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFF141516), RoundedCornerShape(20.dp))
                .padding(2.dp)
        ) {
            Text(
                "Bet",
                modifier = Modifier
                    .weight(1f)
                    .background(Color(0xFF2C2D2E), RoundedCornerShape(18.dp))
                    .padding(vertical = 4.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold
            )
            Text(
                "Auto",
                modifier = Modifier
                    .weight(1f)
                    .padding(vertical = 4.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                color = Color.Gray, fontSize = 11.sp, fontWeight = FontWeight.ExtraBold
            )
        }
        Spacer(modifier = Modifier.height(10.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    modifier = Modifier
                        .background(Color.Black, RoundedCornerShape(20.dp))
                        .border(1.dp, Color(0xFF333333), RoundedCornerShape(20.dp))
                        .padding(4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("-", color = Color.White, fontWeight = FontWeight.Black, modifier = Modifier.padding(horizontal = 8.dp))
                    Text("1.00", color = Color.White, fontWeight = FontWeight.Black, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                    Text("+", color = Color.White, fontWeight = FontWeight.Black, modifier = Modifier.padding(horizontal = 8.dp))
                }
                Spacer(modifier = Modifier.height(5.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    listOf(1, 2, 5, 10).forEach {
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .background(Color(0xFF141516), RoundedCornerShape(10.dp))
                                .border(1.dp, Color(0xFF333333), RoundedCornerShape(10.dp))
                                .padding(vertical = 4.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(it.toString(), color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
            Button(
                onClick = {},
                modifier = Modifier
                    .weight(1f)
                    .height(60.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = if (isFlying) Color(0xFFF5A623) else Color(0xFF28A745))
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(if (isFlying) "CASH OUT" else "BET", fontWeight = FontWeight.Black, fontSize = 16.sp)
                    Text("1.00 INR", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
fun StatsSection() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))
            .background(Color(0xFF1B1C1D))
            .padding(10.dp)
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(15.dp)) {
            Text("All Bets", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp)
            Text("Previous", color = Color.Gray, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp)
            Text("Top", color = Color.Gray, fontWeight = FontWeight.ExtraBold, fontSize = 12.sp)
        }
        Spacer(modifier = Modifier.height(10.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("344/505 Bets", color = Color.Gray, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                Box(modifier = Modifier.width(100.dp).height(3.dp).background(Color(0xFF222222), RoundedCornerShape(2.dp))) {
                    Box(modifier = Modifier.fillMaxWidth(0.7f).fillMaxHeight().background(Color(0xFF28A745), RoundedCornerShape(2.dp)))
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("2,591.00", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Black)
                Text("Total win INR", color = Color.Gray, fontSize = 9.sp, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(modifier = Modifier.height(10.dp))
        // Bets List Header
        Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 5.dp)) {
            Text("Player", modifier = Modifier.weight(2f), color = Color.Gray, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Text("Bet INR", modifier = Modifier.weight(1f), color = Color.Gray, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Text("X", modifier = Modifier.weight(1f), color = Color.Gray, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Text("Win INR", modifier = Modifier.weight(1f), color = Color.Gray, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        }
        // Dummy List
        LazyColumn {
            items(10) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 8.dp, horizontal = 5.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(modifier = Modifier.weight(2f), verticalAlignment = Alignment.CenterVertically) {
                        Box(modifier = Modifier.size(22.dp).clip(CircleShape).background(Color.Gray))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("1***a", color = Color.White, fontSize = 11.sp)
                    }
                    Text("8,000.00", modifier = Modifier.weight(1f), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    Text("", modifier = Modifier.weight(1f))
                    Text("", modifier = Modifier.weight(1f))
                }
            }
        }
    }
}
