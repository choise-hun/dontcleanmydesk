package desk.room

import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import kotlin.io.path.extension
import kotlin.io.path.invariantSeparatorsPathString
import kotlin.io.path.readText
import kotlin.test.Test
import kotlin.test.fail

class ArchitectureGuardrailTest {

    private val mainKotlinDir: Path = Paths.get("src/main/kotlin")

    private fun allKotlinFiles(): List<Path> {
        if (!Files.exists(mainKotlinDir)) return emptyList()
        return Files.walk(mainKotlinDir).use { stream ->
            stream.filter { Files.isRegularFile(it) && it.extension == "kt" }.toList()
        }
    }

    @Test
    fun `Exposed newSuspendedTransaction에 디스패처를 직접 인자로 전달하지 않는다`() {
        val forbiddenRegex = Regex("""newSuspendedTransaction\s*\(\s*Dispatchers\.""")
        val violations = mutableListOf<String>()

        for (file in allKotlinFiles()) {
            val content = file.readText()
            forbiddenRegex.findAll(content).forEach { match ->
                val line = content.take(match.range.first).count { it == '\n' } + 1
                violations.add("${file.invariantSeparatorsPathString}:$line -> withContext(Dispatchers.IO) { newSuspendedTransaction(db = db) { ... } } 패턴을 사용하세요.")
            }
        }

        if (violations.isNotEmpty()) {
            fail("잘못된 newSuspendedTransaction 디스패처 전달 감지:\n" + violations.joinToString("\n"))
        }
    }

    @Test
    fun `코루틴 내에서 HttpClient의 블로킹 send 호출을 금지한다`() {
        val forbiddenRegex = Regex("""\bhttpClient\s*\.\s*send\s*\(""")
        val violations = mutableListOf<String>()

        for (file in allKotlinFiles()) {
            val content = file.readText()
            forbiddenRegex.findAll(content).forEach { match ->
                val line = content.take(match.range.first).count { it == '\n' } + 1
                violations.add("${file.invariantSeparatorsPathString}:$line -> 블로킹 send() 대신 sendAsync(...).await()를 사용하세요.")
            }
        }

        if (violations.isNotEmpty()) {
            fail("HttpClient 블로킹 send() 호출 감지:\n" + violations.joinToString("\n"))
        }
    }

    // 프로젝트 불변식(CLAUDE.md §프로젝트 불변식, H-ARCH-12): 서버 코드에 나오면 안 되는 금지 식별자.
    // 비목표(소셜/공유 피드/AI 자동 분류) 및 타 프로젝트 폴백 식별자 추가 방지.
    private val forbiddenIdentifiers: List<String> = listOf("allowAllOrigins", "publicFeed")

    @Test
    fun `프로젝트 불변식의 금지 식별자를 서버 코드에서 참조하지 않는다`() {
        val violations = mutableListOf<String>()
        for (file in allKotlinFiles()) {
            val content = file.readText()
            forbiddenIdentifiers.filter { content.contains(it) }.forEach {
                violations.add("${file.invariantSeparatorsPathString} -> 금지 식별자 '$it' (CLAUDE.md 프로젝트 불변식)")
            }
        }
        if (violations.isNotEmpty()) {
            fail("금지 식별자 참조 감지:\n" + violations.joinToString("\n"))
        }
    }
}
