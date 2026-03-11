use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tokio_postgres::NoTls;

fn pg_err(e: tokio_postgres::Error) -> String {
    match e.as_db_error() {
        Some(db) => db.message().to_string(),
        None => e.to_string(),
    }
}

async fn admin_client(connection_string: &str) -> Result<tokio_postgres::Client, String> {
    let mut config: tokio_postgres::Config = connection_string
        .parse()
        .map_err(pg_err)?;
    config.dbname("postgres");
    let (client, connection) = config.connect(NoTls).await.map_err(pg_err)?;
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });
    Ok(client)
}

#[tauri::command]
async fn connect_db(connection_string: String) -> Result<String, String> {
    let config: tokio_postgres::Config = connection_string
        .parse()
        .map_err(pg_err)?;
    let db_name = config
        .get_dbname()
        .unwrap_or("unknown")
        .to_string();

    let (client, connection) =
        tokio_postgres::connect(&connection_string, NoTls)
            .await
            .map_err(pg_err)?;
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });

    client
        .batch_execute("SELECT 1")
        .await
        .map_err(pg_err)?;

    Ok(db_name)
}

#[tauri::command]
async fn list_snapshots(
    connection_string: String,
    db_name: String,
) -> Result<Vec<String>, String> {
    let client = admin_client(&connection_string).await?;
    let prefix = format!("{}_snap_", db_name);
    let rows = client
        .query("SELECT datname FROM pg_database ORDER BY datname", &[])
        .await
        .map_err(pg_err)?;
    let names: Vec<String> = rows
        .iter()
        .map(|row| row.get::<_, String>(0))
        .filter(|name| name.starts_with(&prefix))
        .collect();
    Ok(names)
}

#[tauri::command]
async fn create_snapshot(
    connection_string: String,
    db_name: String,
    snapshot_name: String,
) -> Result<(), String> {
    let client = admin_client(&connection_string).await?;

    client
        .batch_execute(&format!(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{}' AND pid <> pg_backend_pid()",
            db_name
        ))
        .await
        .map_err(pg_err)?;

    client
        .batch_execute(&format!(
            "CREATE DATABASE \"{}\" WITH TEMPLATE \"{}\"",
            snapshot_name, db_name
        ))
        .await
        .map_err(pg_err)?;

    Ok(())
}

#[tauri::command]
async fn zero_return(
    connection_string: String,
    db_name: String,
    snapshot_name: String,
) -> Result<(), String> {
    let client = admin_client(&connection_string).await?;

    // Step A: Sniper Query — terminate all connections to the target db
    client
        .batch_execute(&format!(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{}' AND pid <> pg_backend_pid()",
            db_name
        ))
        .await
        .map_err(pg_err)?;

    // Step B: Drop the target database
    client
        .batch_execute(&format!("DROP DATABASE \"{}\"", db_name))
        .await
        .map_err(pg_err)?;

    // Step C: Restore from snapshot template
    client
        .batch_execute(&format!(
            "CREATE DATABASE \"{}\" WITH TEMPLATE \"{}\"",
            db_name, snapshot_name
        ))
        .await
        .map_err(pg_err)?;

    Ok(())
}

#[tauri::command]
async fn delete_snapshot(
    connection_string: String,
    snapshot_name: String,
) -> Result<(), String> {
    let client = admin_client(&connection_string).await?;

    client
        .batch_execute(&format!(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{}' AND pid <> pg_backend_pid()",
            snapshot_name
        ))
        .await
        .map_err(pg_err)?;

    client
        .batch_execute(&format!("DROP DATABASE \"{}\"", snapshot_name))
        .await
        .map_err(pg_err)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connect_db,
            list_snapshots,
            create_snapshot,
            zero_return,
            delete_snapshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
