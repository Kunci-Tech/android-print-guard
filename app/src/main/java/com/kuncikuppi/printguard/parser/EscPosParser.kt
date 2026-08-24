package com.kuncikuppi.printguard.parser

import java.io.ByteArrayInputStream

enum class TextAlign {
    LEFT, CENTER, RIGHT
}

data class FormattedLine(
    val text: String,
    val align: TextAlign = TextAlign.LEFT,
    val isBold: Boolean = false,
    val isDoubleSize: Boolean = false,
    val isCutLine: Boolean = false
)

data class ParsedReceipt(
    val lines: List<FormattedLine>,
    val rawByteCount: Int,
    val hasCutCommand: Boolean
)

object EscPosParser {

    fun parse(bytes: ByteArray): ParsedReceipt {
        val lines = mutableListOf<FormattedLine>()
        val currentLineBuffer = StringBuilder()

        var currentAlign = TextAlign.LEFT
        var currentBold = false
        var currentDoubleSize = false
        var hasCut = false

        val bais = ByteArrayInputStream(bytes)

        while (bais.available() > 0) {
            val b = bais.read() and 0xFF

            when (b) {
                0x0A -> { // Line feed (\n)
                    val lineText = currentLineBuffer.toString()
                    lines.add(
                        FormattedLine(
                            text = lineText,
                            align = currentAlign,
                            isBold = currentBold,
                            isDoubleSize = currentDoubleSize
                        )
                    )
                    currentLineBuffer.clear()
                }
                0x0D -> {
                    // Carriage return - ignore
                }
                0x1B -> { // ESC Command sequence
                    if (bais.available() > 0) {
                        val cmd = bais.read() and 0xFF
                        when (cmd) {
                            0x45 -> { // ESC E (Bold)
                                if (bais.available() > 0) {
                                    val n = bais.read() and 0xFF
                                    currentBold = (n != 0)
                                }
                            }
                            0x61 -> { // ESC a (Align)
                                if (bais.available() > 0) {
                                    val n = bais.read() and 0xFF
                                    currentAlign = when (n) {
                                        1 -> TextAlign.CENTER
                                        2 -> TextAlign.RIGHT
                                        else -> TextAlign.LEFT
                                    }
                                }
                            }
                            0x69 -> { // ESC i (Paper Cut)
                                hasCut = true
                                lines.add(FormattedLine(text = "✂ ─── PAPER CUT ───", align = TextAlign.CENTER, isCutLine = true))
                            }
                            0x6D -> { // ESC m (Partial Cut)
                                hasCut = true
                                lines.add(FormattedLine(text = "✂ ─── PARTIAL CUT ───", align = TextAlign.CENTER, isCutLine = true))
                            }
                            0x40 -> { // ESC @ (Initialize printer)
                                currentAlign = TextAlign.LEFT
                                currentBold = false
                                currentDoubleSize = false
                            }
                            else -> {
                                // Skip unhandled ESC commands
                            }
                        }
                    }
                }
                0x1D -> { // GS Command sequence
                    if (bais.available() > 0) {
                        val cmd = bais.read() and 0xFF
                        when (cmd) {
                            0x21 -> { // GS ! (Double size)
                                if (bais.available() > 0) {
                                    val n = bais.read() and 0xFF
                                    currentDoubleSize = (n != 0)
                                }
                            }
                            0x56 -> { // GS V (Cut Paper)
                                hasCut = true
                                lines.add(FormattedLine(text = "✂ ─── PAPER CUT ───", align = TextAlign.CENTER, isCutLine = true))
                                // Skip optional cut argument if present
                                if (bais.available() > 0) {
                                    bais.mark(1)
                                    val arg = bais.read() and 0xFF
                                    if (arg > 66) {
                                        // Feeds cut distance
                                        if (bais.available() > 0) bais.read()
                                    }
                                }
                            }
                            else -> {
                                // Skip unhandled GS commands
                            }
                        }
                    }
                }
                0x10 -> { // DLE commands (Real-time status)
                    if (bais.available() > 0) {
                        bais.read() // Skip command byte
                        if (bais.available() > 0) bais.read()
                    }
                }
                in 0x20..0x7E -> { // Printable ASCII characters
                    currentLineBuffer.append(b.toChar())
                }
                0x09 -> { // Tab \t
                    currentLineBuffer.append("    ")
                }
                else -> {
                    // Filter non-printable binary control codes
                }
            }
        }

        // Flush remaining buffer if any
        if (currentLineBuffer.isNotEmpty()) {
            lines.add(
                FormattedLine(
                    text = currentLineBuffer.toString(),
                    align = currentAlign,
                    isBold = currentBold,
                    isDoubleSize = currentDoubleSize
                )
            )
        }

        return ParsedReceipt(
            lines = lines,
            rawByteCount = bytes.size,
            hasCutCommand = hasCut
        )
    }
}
