# Java Full-stack Profile

Java profile 是证据要求，不是框架模板。

仅作用于明确选择 Java 的 application。名称保留兼容；不要求该 application
拥有前端。前端验收只在本组件实际拥有前端时适用，不自动引入 Vue/React。

目标项目 MUST 从源码解析并声明：

- Maven/Gradle wrapper、JDK/toolchain、模块和 package owner。
- 后端 static/unit/integration/package 命令。
- Flyway、Liquibase 或项目 migration 的空库和升级样本验证。
- controller/DTO/native API authority、生成客户端和兼容门禁（如适用）。
- 前端 package manager、lint/typecheck/test/build。
- 正负向 API、身份/权限、runtime/browser 和部署边界。

不得由本体系猜测 `mvn test`、`gradle build` 或 Spring 配置；命令必须来自目标仓 wrapper、manifest、CI 或 owner。

实现 MUST 使用公共安全与代码设计基线；JDBC 值使用 `PreparedStatement`
绑定，ORM/raw SQL 同样不得拼接不可信值，动态标识使用 allowlist。服务边界
执行对象/租户权限；事务边界、回滚、异常映射和连接/文件资源释放必须明确。
SHOULD 沿用既有 controller/service/repository 职责，不生成重复 DTO/schema owner。

验收补充：原生测试覆盖参数绑定、权限拒绝、事务失败/回滚及资源释放；运行、
部署或前端检查未实际执行保持 `Not verified`。选型不生成 Java 应用或锁定 JDK。

稳定 JDBC 语义参考：[Prepared statements](https://docs.oracle.com/javase/tutorial/jdbc/basics/prepared.html)；
该教程不决定项目 JDK 版本。
